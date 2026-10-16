import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { DeliveryOutcome, DispatchResult, OutboxLoopOptions, OutboxRecord, OutboxStore, OutboxWorkerOptions, RetryPolicy } from "./types";

const defaultRetry: RetryPolicy = { maxAttempts: 5, baseDelayMs: 1_000, maxDelayMs: 3_600_000 };
const iso = (time: number) => new Date(time).toISOString();

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
          const message = await buildMessage(record, controller.signal);
          controller.signal.throwIfAborted();
          if (now() >= Date.parse(record.locked_until!)) throw new Error("Lease expired.");
          return mailer.send(message, { idempotencyKey: record.event_id, signal: controller.signal });
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("Email delivery timed out."));
          }, Math.min(timeoutMs, remaining));
        }),
      ]);
      if (typeof receipt?.messageId !== "string" || !receipt.messageId.trim() || receipt.messageId.length > 512 || /[\r\n]/.test(receipt.messageId)) throw new Error("Invalid delivery receipt.");
      outcome = { status: "sent", messageId: receipt.messageId };
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
