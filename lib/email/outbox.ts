import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { OutboxHealthSummary } from "@/lib/types";
import { renderEmailTemplate } from "./templates";
import type { DeliveryOutcome, DispatchResult, EmailEventDraft, EmailEventTransaction, EmailEventType, EmailOutboxEvent, EmailTemplatePayload, OutboxLoopOptions, OutboxRecord, OutboxStore, OutboxWorkerOptions, RetryPolicy } from "./types";

const defaultRetry: RetryPolicy = { maxAttempts: 5, baseDelayMs: 1_000, maxDelayMs: 3_600_000 };
const iso = (time: number) => new Date(time).toISOString();

const eventTypes: readonly EmailEventType[] = ["inquiry.received", "inquiry.assigned", "inquiry.status_changed", "quote.requested"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const email = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/;

function object(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error("Invalid email event payload.");
  const record = value as Record<string, unknown>;
  if (required.some((key) => !Object.hasOwn(record, key)) || Object.keys(record).some((key) =>
    (!required.includes(key) && !optional.includes(key)) || record[key] === undefined)) throw new Error("Invalid email event payload.");
  return record;
}

function eventText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\r\n\u0000-\u001f]/.test(value);
}

/** Strict, version-one event payload validation before any persistence call. */
export function validateEmailEventDraft(input: unknown): EmailEventDraft {
  const draft = object(input, ["schema_version", "event_type", "occurrence_id", "payload"]);
  if (draft.schema_version !== 1 || !eventTypes.includes(draft.event_type as EmailEventType) || typeof draft.occurrence_id !== "string" || !uuid.test(draft.occurrence_id)) throw new Error("Invalid email event metadata.");
  const payload = object(draft.payload, draft.event_type === "quote.requested" ? ["inquiryId", "to", "customerName"] : ["inquiryId", "template", "data"], draft.event_type === "quote.requested" ? ["reference"] : []);
  if (typeof payload.inquiryId !== "string" || !uuid.test(payload.inquiryId)) throw new Error("Invalid email event payload.");
  if (draft.event_type === "quote.requested") {
    if (!eventText(payload.to, 254) || !email.test(payload.to) || !eventText(payload.customerName, 120)) throw new Error("Invalid email event payload.");
  } else {
    const expected = { "inquiry.received": "customer_confirmation", "inquiry.assigned": "consultant_assignment", "inquiry.status_changed": "status_update" }[draft.event_type as Exclude<EmailEventType, "quote.requested">];
    if (payload.template !== expected) throw new Error("Invalid email event payload.");
    const required = draft.event_type === "inquiry.received" ? ["to", "customerName"] : draft.event_type === "inquiry.assigned" ? ["to", "inquiryId", "customerName", "adminUrl"] : ["to", "recipient", "inquiryId", "customerName", "status"];
    const optional = draft.event_type === "inquiry.received" ? ["reference", "items"] : draft.event_type === "inquiry.assigned" ? ["customerEmail", "customerPhone", "notes"] : ["previousStatus", "reference"];
    const data = object(payload.data, required, optional);
    if (!eventText(data.to, 254) || !email.test(data.to) || !eventText(data.customerName, 120)) throw new Error("Invalid email event payload.");
    if (draft.event_type !== "inquiry.received" && data.inquiryId !== payload.inquiryId) throw new Error("Invalid email event payload.");
    if (draft.event_type === "inquiry.assigned") {
      if (!eventText(data.adminUrl, 2048)) throw new Error("Invalid email event payload.");
      try { const url = new URL(data.adminUrl); if (!/^https?:$/.test(url.protocol)) throw new Error(); } catch { throw new Error("Invalid email event payload."); }
    }
    if (draft.event_type === "inquiry.status_changed" && (!eventText(data.status, 80) || !["customer", "staff"].includes(data.recipient as string))) throw new Error("Invalid email event payload.");
    if (draft.event_type === "inquiry.received" && data.items !== undefined) {
      if (!Array.isArray(data.items) || data.items.length > 100 || data.items.some((item) => {
        const entry = object(item, ["name", "quantity"], ["unitPrice", "currency"]);
        return !eventText(entry.name, 200) || !Number.isSafeInteger(entry.quantity) || (entry.quantity as number) < 1 ||
          (entry.unitPrice != null && (typeof entry.unitPrice !== "number" || !Number.isFinite(entry.unitPrice) || entry.unitPrice < 0)) ||
          (entry.currency !== undefined && !eventText(entry.currency, 3));
      })) throw new Error("Invalid email event payload.");
    }
    if (data.customerEmail != null && (!eventText(data.customerEmail, 254) || !email.test(data.customerEmail))) throw new Error("Invalid email event payload.");
    for (const key of ["customerPhone", "previousStatus"]) if (data[key] !== undefined && !eventText(data[key], 120)) throw new Error("Invalid email event payload.");
    if (data.notes !== undefined && (typeof data.notes !== "string" || data.notes.length > 2000 || /\u0000/.test(data.notes))) throw new Error("Invalid email event payload.");
    if (data.reference !== undefined && !(typeof data.reference === "number" && Number.isSafeInteger(data.reference) && data.reference >= 0) && !eventText(data.reference, 80)) throw new Error("Invalid email event payload.");
  }
  if (payload.reference !== undefined && !(typeof payload.reference === "number" && Number.isSafeInteger(payload.reference) && payload.reference >= 0) && !eventText(payload.reference, 80)) throw new Error("Invalid email event payload.");
  return structuredClone(draft) as EmailEventDraft;
}

/** A business occurrence, rather than message contents, determines deduplication. */
export function emailEventIdempotencyKey(eventType: EmailEventType, occurrenceId: string): string {
  if (!eventTypes.includes(eventType) || !uuid.test(occurrenceId)) throw new Error("Invalid email event metadata.");
  return createHash("sha256").update(`email:v1\0${eventType}\0${occurrenceId.toLowerCase()}`).digest("hex");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

/** The supplied transaction owns the atomic insert/unique-conflict read and
 * must commit with the domain mutation. Conflicting payloads for one occurrence
 * are rejected rather than silently accepting a different email. */
export async function enqueueEmailEvent(transaction: EmailEventTransaction, input: EmailEventDraft): Promise<EmailOutboxEvent> {
  const draft = validateEmailEventDraft(input);
  const key = emailEventIdempotencyKey(draft.event_type, draft.occurrence_id);
  const saved = await transaction.insertOrGet({ ...draft, idempotency_key: key });
  if (saved.idempotency_key !== key || saved.schema_version !== draft.schema_version || saved.event_type !== draft.event_type || canonical(saved.payload) !== canonical(draft.payload)) throw new Error("Email event idempotency conflict.");
  return saved;
}

/** Decode only validated version-one inquiry change envelopes from persistence. */
export function buildInquiryChangeMessage(record: OutboxRecord): EmailTemplatePayload {
  if (record.event_type !== "inquiry.assigned" && record.event_type !== "inquiry.status_changed") {
    throw new Error("Unsupported inquiry email event.");
  }
  const draft = validateEmailEventDraft({ schema_version: record.schema_version, event_type: record.event_type,
    occurrence_id: record.event_id, payload: record.payload });
  if (record.idempotency_key !== emailEventIdempotencyKey(draft.event_type, draft.occurrence_id) ||
      draft.payload.inquiryId !== record.inquiry_id) throw new Error("Invalid persisted email event.");
  if (!("template" in draft.payload)) throw new Error("Invalid persisted email event.");
  return { template: draft.payload.template, data: draft.payload.data } as EmailTemplatePayload;
}

function positiveInteger(value: number, name: string, max = 2_147_483_647) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error(`Invalid ${name}.`);
}

function retryPolicy(overrides: Partial<RetryPolicy> = {}): RetryPolicy {
  const policy = { ...defaultRetry, ...overrides };
  positiveInteger(policy.maxAttempts, "maximum attempts");
  positiveInteger(policy.baseDelayMs, "base retry delay");
  positiveInteger(policy.maxDelayMs, "maximum retry delay");
  if (policy.baseDelayMs > policy.maxDelayMs) throw new Error("Base retry delay exceeds maximum.");
  return policy;
}

/** Equal jitter, capped before jitter so every retry remains within the cap. */
export function calculateRetryDelay(attempt: number, overrides: Partial<RetryPolicy> = {}, random: () => number = Math.random): number {
  positiveInteger(attempt, "attempt");
  const policy = retryPolicy(overrides);
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new Error("Invalid retry jitter.");
  const cap = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** Math.min(attempt - 1, 52));
  return Math.max(1, Math.floor(cap / 2 + sample * cap / 2));
}

/** No client or credentials are created here. A trusted server worker must
 * explicitly supply its client. Existing locked_until + attempts form a lease
 * fence; every claim consumes an attempt, including a worker that later crashes.
 * Workers must use synchronized clocks. No schema changes or RPC are required.
 */
export function createSupabaseOutboxStore(client: SupabaseClient<Database>): OutboxStore {
  function compare(record: OutboxRecord, changes: Database["public"]["Tables"]["email_outbox"]["Update"]) {
    const query = client.from("email_outbox").update(changes).eq("id", record.id)
      .eq("status", record.status).eq("attempts", record.attempts).eq("next_attempt_at", record.next_attempt_at);
    return record.locked_until === null ? query.is("locked_until", null) : query.eq("locked_until", record.locked_until);
  }
  return {
    async listDue(now, limit) {
      positiveInteger(limit, "batch size", 100);
      const { data, error } = await client.from("email_outbox").select("*")
        .in("status", ["pending", "processing"]).lte("next_attempt_at", iso(now))
        .or(`locked_until.is.null,locked_until.lte.${iso(now)}`)
        .order("next_attempt_at").order("id").limit(limit);
      if (error) throw new Error("Unable to read email outbox.");
      return data ?? [];
    },
    async claim(record, now, leaseMs, maxAttempts) {
      positiveInteger(leaseMs, "lease duration");
      positiveInteger(maxAttempts, "maximum attempts");
      if (!["pending", "processing"].includes(record.status) || Date.parse(record.next_attempt_at) > now ||
          (record.locked_until !== null && Date.parse(record.locked_until) > now)) return { status: "contended" };
      const exhausted = record.attempts >= maxAttempts;
      const changes = exhausted
        ? { status: "failed", locked_until: null, last_error: "Maximum delivery attempts reached." }
        : { status: "processing", attempts: record.attempts + 1, locked_until: iso(now + leaseMs) };
      const { data, error } = await compare(record, changes).select("*").maybeSingle();
      if (error) throw new Error("Unable to claim email outbox record.");
      if (!data) return { status: "contended" };
      return exhausted ? { status: "exhausted" } : { status: "claimed", record: data };
    },
    async finish(record, now, outcome) {
      if (record.status !== "processing" || record.locked_until === null || Date.parse(record.locked_until) <= now) return false;
      const changes = outcome.status === "sent"
        ? { status: "sent", locked_until: null, provider_message_id: outcome.messageId, last_error: null }
        : { status: outcome.status, locked_until: null, provider_message_id: null, last_error: outcome.error, next_attempt_at: outcome.nextAttemptAt };
      const { data, error } = await compare(record, changes).gt("locked_until", iso(now)).select("id").maybeSingle();
      if (error) throw new Error("Unable to save email delivery result.");
      return data !== null;
    },
  };
}

/** Counts are queried in the database, so inspection does not download messages
 * or depend on PostgREST's default row limit. Failed rows are dead letters until
 * an operator explicitly retries them. `due` includes expired processing leases.
 */
export async function inspectOutboxHealth(client: SupabaseClient<Database>, now = Date.now()) {
  const statuses = ["pending", "processing", "failed", "sent"] as const;
  const counts = await Promise.all([
    ...statuses.map((status) => client.from("email_outbox").select("id", { count: "exact", head: true }).eq("status", status)),
    client.from("email_outbox").select("id", { count: "exact", head: true })
      .in("status", ["pending", "processing"]).lte("next_attempt_at", iso(now))
      .or(`locked_until.is.null,locked_until.lte.${iso(now)}`),
  ]);
  if (counts.some(({ error, count }) => error || count === null)) throw new Error("Unable to inspect email outbox.");
  const [pending, processing, failed, sent, due] = counts.map(({ count }) => count!);
  return { pending, processing, failed, sent, due, deadLetter: failed };
}

/** Admin dashboard projection. Only a pending timestamp is read in addition to
 * count-only queries; individual records and delivery details are never returned.
 */
export async function getOutboxHealthSummary(client: SupabaseClient<Database>, now = Date.now()): Promise<OutboxHealthSummary> {
  const counts = await inspectOutboxHealth(client, now);
  let oldestPendingAgeSeconds: number | null = null;
  if (counts.pending > 0) {
    const { data, error } = await client.from("email_outbox").select("created_at")
      .eq("status", "pending").order("created_at", { ascending: true }).limit(1);
    if (error) throw new Error("Unable to inspect email outbox.");
    // A worker may complete the last pending row between the count and this read.
    if (data?.[0]) {
      const createdAt = Date.parse(data[0].created_at);
      if (!Number.isFinite(createdAt)) throw new Error("Unable to inspect email outbox.");
      oldestPendingAgeSeconds = Math.max(0, Math.floor((now - createdAt) / 1000));
    }
  }
  const { pending, processing, sent, failed, deadLetter, due } = counts;
  const completed = sent + failed;
  return {
    total: pending + processing + completed,
    pending, processing, sent, failed, deadLetter,
    retryBacklog: due,
    oldestPendingAgeSeconds,
    failureRatePercent: completed === 0 ? 0 : Math.round((failed / completed) * 100),
  };
}

/** Retry only the specified IDs, or a bounded batch of failed rows when IDs are
 * omitted. Failed rows are atomically reopened with a fresh attempt budget;
 * pending rows and expired processing leases retain their existing attempts.
 * The normal worker still owns claiming, rendering, sending and finishing.
 */
export async function dispatchScopedOutboxRetry(options: Omit<OutboxWorkerOptions, "store"> & {
  client: SupabaseClient<Database>;
  ids?: readonly string[];
}): Promise<DispatchResult[]> {
  const { client, ids, ...worker } = options;
  const now = worker.now ?? Date.now;
  const batchSize = worker.batchSize ?? 25;
  const leaseMs = worker.leaseMs ?? 60_000;
  const timeoutMs = worker.deliveryTimeoutMs ?? 30_000;
  retryPolicy(worker.retry);
  positiveInteger(batchSize, "batch size", 100);
  positiveInteger(leaseMs, "lease duration");
  positiveInteger(timeoutMs, "delivery timeout");
  if (timeoutMs >= leaseMs) throw new Error("Delivery timeout must be shorter than the lease.");
  if (ids !== undefined && (ids.length > 100 || ids.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))) {
    throw new Error("Invalid email outbox IDs.");
  }
  if (worker.signal?.aborted || ids?.length === 0) return [];

  const selectedIds = ids === undefined ? undefined : [...new Set(ids)];
  if (selectedIds && selectedIds.length > batchSize) throw new Error("Email outbox ID count exceeds batch size.");
  let query = client.from("email_outbox").select("*");
  if (selectedIds) query = query.in("id", selectedIds).in("status", ["pending", "processing", "failed"]);
  else query = query.eq("status", "failed");
  const { data, error } = await query.order("next_attempt_at").order("id").limit(batchSize);
  if (error) throw new Error("Unable to read email outbox for retry.");
  const eligibleIds: string[] = [];
  for (const record of data ?? []) {
    if (worker.signal?.aborted) break;
    if (record.status !== "failed") {
      eligibleIds.push(record.id);
      continue;
    }
    if (record.locked_until !== null) continue;
    const { data: reopened, error: updateError } = await client.from("email_outbox")
      .update({ status: "pending", attempts: 0, next_attempt_at: iso(now()), locked_until: null, last_error: null })
      .eq("id", record.id).eq("status", "failed").eq("attempts", record.attempts)
      .eq("next_attempt_at", record.next_attempt_at).is("locked_until", null)
      .select("id").maybeSingle();
    if (updateError) throw new Error("Unable to requeue email outbox record.");
    if (reopened) eligibleIds.push(record.id);
  }
  if (worker.signal?.aborted || eligibleIds.length === 0) return [];

  const store = createSupabaseOutboxStore(client);
  const scopedStore: OutboxStore = {
    ...store,
    async listDue(at, limit) {
      positiveInteger(limit, "batch size", 100);
      const { data: due, error: listError } = await client.from("email_outbox").select("*")
        .in("id", eligibleIds).in("status", ["pending", "processing"])
        .lte("next_attempt_at", iso(at)).or(`locked_until.is.null,locked_until.lte.${iso(at)}`)
        .order("next_attempt_at").order("id").limit(limit);
      if (listError) throw new Error("Unable to read email outbox for retry.");
      return due ?? [];
    },
  };
  return dispatchOutboxBatch({ ...worker, store: scopedStore });
}

/** One bounded batch for an external scheduler, or runOutboxWorker below.
 * Message rendering and transport work share a timeout shorter than the lease.
 * No work starts at module import or during a Next.js build/prerender.
 */
export async function dispatchOutboxBatch(options: OutboxWorkerOptions): Promise<DispatchResult[]> {
  const { store, mailer, buildMessage, signal } = options;
  const now = options.now ?? Date.now;
  const batchSize = options.batchSize ?? 25;
  const leaseMs = options.leaseMs ?? 60_000;
  const timeoutMs = options.deliveryTimeoutMs ?? 30_000;
  const retry = retryPolicy(options.retry);
  positiveInteger(batchSize, "batch size", 100);
  positiveInteger(leaseMs, "lease duration");
  positiveInteger(timeoutMs, "delivery timeout");
  if (timeoutMs >= leaseMs) throw new Error("Delivery timeout must be shorter than the lease.");
  if (signal?.aborted) return [];
  const records = await store.listDue(now(), batchSize);
  const results: DispatchResult[] = [];
  for (const candidate of records) {
    if (signal?.aborted) break;
    const claim = await store.claim(candidate, now(), leaseMs, retry.maxAttempts);
    if (claim.status !== "claimed") {
      results.push({ id: candidate.id, status: claim.status === "exhausted" ? "failed" : "contended" });
      continue;
    }
    const record = claim.record;
    const remaining = Date.parse(record.locked_until!) - now();
    if (remaining <= 0) {
      results.push({ id: record.id, status: "lease_lost" });
      continue;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let outcome: DeliveryOutcome;
    try {
      const receipt = await Promise.race([
        (async () => {
          const built = await buildMessage(record, controller.signal);
          controller.signal.throwIfAborted();
          if (now() >= Date.parse(record.locked_until!)) throw new Error("Lease expired.");
          const message = "template" in built ? renderEmailTemplate(built) : built;
          return mailer.send(message, { idempotencyKey: record.idempotency_key ?? record.event_id, signal: controller.signal });
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("Email delivery timed out."));
          }, Math.min(timeoutMs, remaining));
        }),
      ]);
      if (receipt?.deferred === true) {
        if (typeof receipt.token !== "string" || !receipt.token.trim() || receipt.token.length > 512 || /[\r\n]/.test(receipt.token)) throw new Error("Invalid deferral token.");
        const terminal = record.attempts >= retry.maxAttempts;
        outcome = { status: terminal ? "failed" : "pending", error: "Email delivery deferred.",
          nextAttemptAt: iso(now() + (terminal ? 0 : calculateRetryDelay(record.attempts, retry, options.random))) };
      } else {
        if (typeof receipt?.messageId !== "string" || !receipt.messageId.trim() || receipt.messageId.length > 512 || /[\r\n]/.test(receipt.messageId)) throw new Error("Invalid delivery receipt.");
        outcome = { status: "sent", messageId: receipt.messageId };
      }
    } catch {
      // Provider errors can contain addresses, message bodies or credentials.
      const terminal = record.attempts >= retry.maxAttempts;
      outcome = { status: terminal ? "failed" : "pending", error: "Email delivery failed or timed out.",
        nextAttemptAt: iso(now() + (terminal ? 0 : calculateRetryDelay(record.attempts, retry, options.random))) };
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
    // A persistence error must propagate, not be mistaken for a send failure.
    // The lease remains recoverable, with the same provider idempotency key.
    const saved = await store.finish(record, now(), outcome);
    results.push({ id: record.id, status: saved ? (outcome.status === "pending" ? "retry" : outcome.status) : "lease_lost" });
  }
  return results;
}

/** Graceful stop: finish the bounded active delivery, then stop claiming work. */
export async function runOutboxWorker(options: OutboxLoopOptions): Promise<void> {
  const pollIntervalMs = options.pollIntervalMs ?? 5_000;
  positiveInteger(pollIntervalMs, "poll interval");
  while (!options.signal.aborted) {
    await dispatchOutboxBatch(options);
    if (options.signal.aborted) break;
    await new Promise<void>((resolve) => {
      const done = () => { clearTimeout(timer); options.signal.removeEventListener("abort", done); resolve(); };
      const timer = setTimeout(done, pollIntervalMs);
      options.signal.addEventListener("abort", done, { once: true });
      if (options.signal.aborted) done();
    });
  }
}
