import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createClient } from "@supabase/supabase-js";
import { loadModule } from "./helpers/load-module.mjs";

const { calculateRetryDelay, createSupabaseOutboxStore, dispatchOutboxBatch, dispatchScopedOutboxRetry, emailEventIdempotencyKey, enqueueEmailEvent, getOutboxHealthSummary, inspectOutboxHealth, runOutboxWorker, validateEmailEventDraft } = loadModule("lib/email/outbox.ts", { "server-only": {} });
const { createMockMailer, createDeferredMailer, createStagingMailer, createConsoleMailer } = loadModule("lib/email/mailer.ts", { "server-only": {} });
const message = { to: "customer@example.com", subject: "Inquiry received", text: "Thank you", html: "<p>Thank you</p>" };
const delivery = (idempotencyKey = randomUUID()) => ({ idempotencyKey, signal: new AbortController().signal });
const epoch = Date.parse("2026-10-17T00:00:00Z");
const iso = (time) => new Date(time).toISOString();

test("versioned event payloads validate before a transaction is touched", async () => {
  const inquiryId = randomUUID(), occurrence_id = randomUUID();
  const received = { schema_version: 1, event_type: "inquiry.received", occurrence_id, payload: { inquiryId, template: "customer_confirmation", data: { to: "customer@example.com", customerName: "Ari", items: [{ name: "Oak table", quantity: 1 }] } } };
  const assigned = { schema_version: 1, event_type: "inquiry.assigned", occurrence_id, payload: { inquiryId, template: "consultant_assignment", data: { to: "staff@example.com", inquiryId, customerName: "Ari", adminUrl: "https://example.test/admin", notes: "First line\nSecond line" } } };
  const status = { schema_version: 1, event_type: "inquiry.status_changed", occurrence_id, payload: { inquiryId, template: "status_update", data: { to: "customer@example.com", inquiryId, customerName: "Ari", recipient: "customer", status: "completed" } } };
  const quote = { schema_version: 1, event_type: "quote.requested", occurrence_id, payload: { inquiryId, to: "staff@example.com", customerName: "Ari" } };
  for (const draft of [received, assigned, status, quote]) assert.deepEqual(validateEmailEventDraft(draft), draft);
  let writes = 0;
  const transaction = { insertOrGet: async () => { writes++; assert.fail("Invalid event reached transaction"); } };
  for (const invalid of [
    { ...received, schema_version: 2 }, { ...received, event_type: "unknown" }, { ...received, occurrence_id: "bad" },
    { ...received, payload: { ...received.payload, template: "status_update" } },
    { ...received, payload: { ...received.payload, extra: "private" } },
    { ...received, payload: { ...received.payload, data: { ...received.payload.data, to: "a@example.com\nBcc:x@example.com" } } },
    { ...received, payload: { ...received.payload, data: { ...received.payload.data, reference: undefined } } },
    { ...received, payload: { ...received.payload, data: { ...received.payload.data, items: [{ name: "Oak", quantity: 0 }] } } },
    { ...assigned, payload: { ...assigned.payload, data: { ...assigned.payload.data, inquiryId: randomUUID() } } },
    { ...status, payload: { ...status.payload, data: { ...status.payload.data, recipient: "everyone" } } },
    { ...quote, payload: { ...quote.payload, to: "bad" } },
  ]) await assert.rejects(enqueueEmailEvent(transaction, invalid), /Invalid email event/);
  assert.equal(writes, 0);
});

test("event idempotency uses occurrence and type, with atomic insert-or-get semantics", async () => {
  const occurrence_id = randomUUID(), inquiryId = randomUUID();
  const draft = { schema_version: 1, event_type: "quote.requested", occurrence_id, payload: { inquiryId, to: "staff@example.com", customerName: "Ari" } };
  const rows = new Map();
  let inserts = 0;
  const transaction = { async insertOrGet(input) {
    const existing = rows.get(input.idempotency_key);
    if (existing) return existing;
    inserts++;
    const row = { id: randomUUID(), schema_version: input.schema_version, event_type: input.event_type, payload: input.payload, idempotency_key: input.idempotency_key,
      status: "pending", attempts: 0, last_error: null, created_at: iso(epoch), updated_at: iso(epoch) };
    rows.set(input.idempotency_key, row);
    return row;
  } };
  const first = await enqueueEmailEvent(transaction, draft);
  assert.deepEqual(await enqueueEmailEvent(transaction, { ...draft, occurrence_id: occurrence_id.toUpperCase() }), first);
  assert.equal(inserts, 1);
  assert.match(first.idempotency_key, /^[0-9a-f]{64}$/);
  assert.equal(first.idempotency_key, emailEventIdempotencyKey(draft.event_type, occurrence_id));
  assert.notEqual(first.idempotency_key, emailEventIdempotencyKey("inquiry.received", occurrence_id));
  await assert.rejects(enqueueEmailEvent(transaction, { ...draft, payload: { ...draft.payload, to: "other@example.com" } }), /idempotency conflict/);
  assert.equal(inserts, 1);
  await assert.rejects(enqueueEmailEvent({ insertOrGet: async () => { throw new Error("transaction rolled back"); } }, draft), /transaction rolled back/);
});

test("mock failure simulation and deferred provider are deterministic and inspectable", async () => {
  const options = delivery(), mock = createMockMailer({ failAttempts: { [options.idempotencyKey]: 1 } });
  await assert.rejects(mock.send(message, options), /Mock email delivery failed/);
  assert.equal(mock.deliveries.length, 0);
  const receipt = await mock.send(message, options);
  assert.deepEqual(await mock.send(message, options), receipt);
  assert.equal(mock.deliveries.length, 1);
  const deferred = createDeferredMailer();
  assert.deepEqual(await deferred.send(message, options), { deferred: true, token: `deferred:${options.idempotencyKey}` });
  assert.deepEqual(await deferred.send(message, options), { deferred: true, token: `deferred:${options.idempotencyKey}` });
  const snapshot = deferred.deferrals;
  snapshot[0].message.to = "changed@example.com";
  assert.equal(deferred.deferrals[0].message.to, message.to);
  assert.equal(deferred.deferrals.length, 2);
});

test("retry delay grows exponentially with bounded equal jitter and a ceiling", () => {
  const retry = { baseDelayMs: 1000, maxDelayMs: 5000 };
  assert.deepEqual([1, 2, 3, 4, 100].map((attempt) => calculateRetryDelay(attempt, retry, () => 0)), [500, 1000, 2000, 2500, 2500]);
  assert.equal(calculateRetryDelay(2, retry, () => 0.5), 1500);
  assert.equal(calculateRetryDelay(100, retry, () => 0.999999), 4999);
  assert.equal(calculateRetryDelay(1, { baseDelayMs: 1 }, () => 0), 1);
  for (const attempt of [0, -1, 1.5, Infinity]) assert.throws(() => calculateRetryDelay(attempt));
  for (const sample of [-1, 1, NaN, Infinity]) assert.throws(() => calculateRetryDelay(1, {}, () => sample));
  for (const policy of [{ maxAttempts: 0 }, { baseDelayMs: 0 }, { maxDelayMs: 1 }, { maxDelayMs: Infinity }]) assert.throws(() => calculateRetryDelay(1, policy));
});

test("mock transport deduplicates event IDs, isolates snapshots, and rejects invalid or cancelled mail", async () => {
  const mock = createMockMailer(), options = delivery();
  const first = await mock.send(message, options);
  first.messageId = "mutated";
  assert.equal((await mock.send(message, options)).messageId, `mock:${options.idempotencyKey}`);
  const saved = mock.deliveries;
  saved[0].message.to = "changed@example.com";
  saved.pop();
  assert.equal(mock.deliveries.length, 1);
  assert.deepEqual(mock.deliveries[0].message, message);
  for (const change of [{ to: "bad" }, { to: "a@example.com,b@example.com" }, { to: "a@example.com\nBcc:x@example.com" }, { subject: "bad\r\n" }, { text: " " }]) {
    await assert.rejects(mock.send({ ...message, ...change }, delivery()));
  }
  await assert.rejects(mock.send(message, delivery("")));
  await assert.rejects(mock.send(message, { ...delivery(), signal: AbortSignal.abort() }));
  assert.equal(mock.deliveries.length, 1);
});

test("staging always redirects envelopes, drops extra headers, and refuses production", async (t) => {
  const previous = process.env.VERCEL_ENV;
  t.after(() => { if (previous === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previous; });
  process.env.VERCEL_ENV = "preview";
  const transport = createMockMailer();
  for (const environment of ["development", "test", "staging"]) {
    const staging = createStagingMailer({ environment, recipient: "sandbox@example.com", transport });
    await staging.send({ ...message, cc: "real@example.com", bcc: "real@example.com", headers: { To: "real@example.com" } }, delivery());
  }
  assert.equal(transport.deliveries.length, 3);
  for (const { message: sent } of transport.deliveries) assert.deepEqual(sent, { ...message, to: "sandbox@example.com", subject: `[STAGING] ${message.subject}` });
  assert.throws(() => createStagingMailer({ environment: "production", recipient: "sandbox@example.com", transport }), /production/);
  assert.throws(() => createStagingMailer({ environment: "staging", recipient: "bad", transport }), /recipient/);
  const staging = createStagingMailer({ environment: "staging", recipient: "sandbox@example.com", transport });
  process.env.VERCEL_ENV = "production";
  assert.throws(() => createStagingMailer({ environment: "staging", recipient: "sandbox@example.com", transport }), /production/);
  await assert.rejects(staging.send(message, delivery()), /production/);
  assert.equal(transport.deliveries.length, 3);
});

test("console mailer logs only event and receipt metadata", async () => {
  const entries = [], options = delivery();
  const receipt = await createConsoleMailer((entry) => entries.push(entry)).send(message, options);
  assert.deepEqual(entries, [{ eventId: options.idempotencyKey, messageId: receipt.messageId }]);
  assert.doesNotMatch(JSON.stringify(entries), /customer|Thank you|Inquiry received/);
});

// Translate the small PostgREST subset used by the real Supabase query builder
// into parameterized local SQL. Every fetch is intercepted; no HTTP or secrets.
async function database(t) {
  const db = new PGlite();
  t.after(() => db.close());
  const migration = await readFile(new URL("../supabase/migrations/20261014080743_aven_mvp_foundation.sql", import.meta.url), "utf8");
  const ddl = migration.match(/create table public\.email_outbox \([\s\S]*?\n\);/)[0];
  await db.exec("create table public.inquiries (id uuid primary key)");
  await db.exec(ddl);
  const parent = randomUUID();
  await db.query("insert into inquiries values ($1)", [parent]);
  const columns = new Set(["id", "event_id", "inquiry_id", "status", "attempts", "next_attempt_at", "locked_until", "provider_message_id", "last_error", "created_at", "updated_at"]);
  const column = (name) => { assert.ok(columns.has(name), `Unexpected column ${name}`); return name; };
  const requests = [];
  const client = () => createClient("https://outbox-test.invalid", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, options) => {
      const { pathname, searchParams: params } = new URL(url);
      assert.equal(pathname, "/rest/v1/email_outbox");
      assert.ok(["GET", "HEAD", "PATCH"].includes(options.method));
      requests.push({ method: options.method, params });
      const values = [], predicates = [];
      const param = (value) => { values.push(value); return `$${values.length}`; };
      let assignments;
      if (options.method === "PATCH") assignments = Object.entries(JSON.parse(options.body)).map(([key, value]) => `${column(key)}=${param(value)}`).join(",");
      for (const [key, value] of params) {
        if (["select", "order", "limit"].includes(key)) continue;
        if (key === "or") {
          const match = value.match(/^\(locked_until\.is\.null,locked_until\.lte\.(.+)\)$/);
          assert.ok(match);
          predicates.push(`(locked_until is null or locked_until <= ${param(match[1])})`);
          continue;
        }
        const match = value.match(/^(eq|lte|gt|is|in)\.(.*)$/);
        assert.ok(match, value);
        const [, op, operand] = match;
        if (op === "is") { assert.equal(operand, "null"); predicates.push(`${column(key)} is null`); }
        else if (op === "in") {
          assert.match(operand, /^\([^()]+\)$/);
          predicates.push(`${column(key)} in (${operand.slice(1, -1).split(",").map(param).join(",")})`);
        } else predicates.push(`${column(key)} ${{ eq: "=", lte: "<=", gt: ">" }[op]} ${param(operand)}`);
      }
      const where = predicates.length ? ` where ${predicates.join(" and ")}` : "";
      let sql;
      if (options.method === "PATCH") sql = `with changed as (update email_outbox set ${assignments}${where} returning *) select row_to_json(changed) as row from changed`;
      else if (options.method === "HEAD") sql = `select count(*)::int as total from email_outbox${where}`;
      else {
        const selection = params.get("select") ?? "*";
        const projection = selection === "*" ? "*" : selection.split(",").map(column).join(",");
        const ordering = params.get("order")?.split(",").map((part) => {
          const [name, direction] = part.split(".");
          assert.equal(direction, "asc"); return `${column(name)} asc`;
        }).join(",");
        sql = `select row_to_json(rows) as row from (select ${projection} from email_outbox${where}${ordering ? ` order by ${ordering}` : ""}${params.has("limit") ? ` limit ${param(Number(params.get("limit")))}` : ""}) rows`;
      }
      const { rows } = await db.query(sql, values);
      if (options.method === "HEAD") return new Response(null, { status: 200, headers: { "content-range": `*/${rows[0].total}` } });
      return new Response(JSON.stringify(rows.map(({ row }) => row)), { status: 200, headers: { "content-type": "application/json" } });
    } },
  });
  return {
    db, requests, client, store: () => createSupabaseOutboxStore(client()),
    async insert(overrides = {}) {
      const data = { inquiry_id: parent, next_attempt_at: iso(epoch), ...overrides };
      const entries = Object.entries(data);
      const { rows } = await db.query(`with inserted as (insert into email_outbox (${entries.map(([key]) => column(key)).join(",")}) values (${entries.map((_, i) => `$${i + 1}`).join(",")}) returning *) select row_to_json(inserted) as row from inserted`, entries.map(([, value]) => value));
      return rows[0].row;
    },
    async get(id) { return (await db.query("select row_to_json(e) as row from email_outbox e where id=$1", [id])).rows[0].row; },
  };
}

test("outbox integration with real query builder and isolated PostgreSQL", async (t) => {
  const fixture = await database(t);
  const { db, insert, get } = fixture;
  let time = epoch;
  const options = (overrides = {}) => ({ store: fixture.store(), mailer: createMockMailer(), buildMessage: async () => message, now: () => time, random: () => 0, ...overrides });
  async function scenario(name, fn) {
    await t.test(name, async () => { await db.exec("delete from email_outbox"); time = epoch; await fn(); });
  }

  await scenario("health reports exact status, dead-letter and currently due counts", async () => {
    await insert({ created_at: iso(epoch - 61_000) });
    await insert({ next_attempt_at: iso(epoch + 1), created_at: iso(epoch - 30_000) });
    await insert({ status: "processing", attempts: 1, locked_until: iso(epoch - 1) });
    await insert({ status: "processing", attempts: 1, locked_until: iso(epoch + 1) });
    await insert({ status: "failed", attempts: 5, last_error: "customer@example.com Private delivery failure" });
    await insert({ status: "sent" });
    assert.deepEqual(await inspectOutboxHealth(fixture.client(), epoch), {
      pending: 2, processing: 2, failed: 1, sent: 1, due: 2, deadLetter: 1,
    });
    assert.equal(fixture.requests.filter(({ method }) => method === "HEAD").length, 5);
    assert.equal((await inspectOutboxHealth(fixture.client(), epoch + 1)).due, 4);
    const before = fixture.requests.length;
    const summary = await getOutboxHealthSummary(fixture.client(), epoch);
    assert.deepEqual(summary, {
      total: 6, pending: 2, processing: 2, sent: 1, failed: 1, deadLetter: 1,
      retryBacklog: 2, oldestPendingAgeSeconds: 61, failureRatePercent: 50,
    });
    assert.doesNotMatch(JSON.stringify(summary), /customer@example.com|Private delivery failure/);
    const reads = fixture.requests.slice(before);
    assert.equal(reads.filter(({ method }) => method === "HEAD").length, 5);
    assert.equal(reads.filter(({ method }) => method === "GET").length, 1);
    assert.ok(reads.every(({ method, params }) => method === "HEAD" ? params.get("select") === "id" : params.get("select") === "created_at"));
    assert.ok(reads.every(({ method }) => method !== "PATCH"));
  });

  await scenario("empty outbox health has zero rates and no record query", async () => {
    const before = fixture.requests.length;
    assert.deepEqual(await getOutboxHealthSummary(fixture.client(), epoch), {
      total: 0, pending: 0, processing: 0, sent: 0, failed: 0, deadLetter: 0,
      retryBacklog: 0, oldestPendingAgeSeconds: null, failureRatePercent: 0,
    });
    assert.ok(fixture.requests.slice(before).every(({ method }) => method === "HEAD"));
  });

  await scenario("selected retry sends only due IDs through the worker and resets failed attempt budget", async () => {
    const pending = await insert();
    const failed = await insert({ status: "failed", attempts: 5, last_error: "Earlier failure" });
    const outside = await insert();
    const otherFailed = await insert({ status: "failed", attempts: 5 });
    const leased = await insert({ status: "processing", attempts: 1, locked_until: iso(epoch + 1000) });
    const sent = await insert({ status: "sent" });
    const future = await insert({ next_attempt_at: iso(epoch + 1000) });
    const mailer = createMockMailer();
    const results = await dispatchScopedOutboxRetry({ client: fixture.client(), ids: [pending.id, failed.id, leased.id, sent.id, future.id, failed.id],
      mailer, buildMessage: async () => message, now: () => epoch });
    assert.deepEqual(new Set(results.map(({ id, status }) => `${id}:${status}`)), new Set([`${pending.id}:sent`, `${failed.id}:sent`]));
    assert.equal(mailer.deliveries.length, 2);
    assert.deepEqual(new Set(mailer.deliveries.map(({ idempotencyKey }) => idempotencyKey)), new Set([pending.event_id, failed.event_id]));
    assert.equal((await get(failed.id)).attempts, 1);
    assert.equal((await get(outside.id)).status, "pending");
    assert.equal((await get(otherFailed.id)).status, "failed");
    assert.equal((await get(leased.id)).status, "processing");
    assert.equal((await get(sent.id)).status, "sent");
    assert.equal((await get(future.id)).status, "pending");
  });

  await scenario("failed-only retry is bounded and concurrent attempts cannot double send", async () => {
    const first = await insert({ status: "failed", attempts: 5, next_attempt_at: iso(epoch - 1) });
    const second = await insert({ status: "failed", attempts: 5 });
    const mailer = createMockMailer();
    const config = { client: fixture.client(), mailer, buildMessage: async () => message, now: () => epoch, batchSize: 1 };
    assert.deepEqual(await dispatchScopedOutboxRetry(config), [{ id: first.id, status: "sent" }]);
    assert.equal((await get(second.id)).status, "failed");
    const concurrent = await Promise.all([dispatchScopedOutboxRetry(config), dispatchScopedOutboxRetry(config)]);
    assert.equal(concurrent.flat().filter(({ status }) => status === "sent").length, 1);
    assert.equal(mailer.deliveries.length, 2);
    assert.equal((await get(second.id)).attempts, 1);
  });

  await scenario("retry respects failed delivery backoff and aborts without opening records", async () => {
    const row = await insert({ status: "failed", attempts: 5 });
    const mailer = { send: async () => { throw new Error("delivery unavailable"); } };
    const config = { client: fixture.client(), ids: [row.id], mailer, buildMessage: async () => message, now: () => time,
      retry: { maxAttempts: 2 }, random: () => 0 };
    assert.deepEqual(await dispatchScopedOutboxRetry({ ...config, signal: AbortSignal.abort() }), []);
    assert.equal((await get(row.id)).status, "failed");
    assert.deepEqual(await dispatchScopedOutboxRetry(config), [{ id: row.id, status: "retry" }]);
    assert.equal((await get(row.id)).attempts, 1);
    assert.deepEqual(await dispatchScopedOutboxRetry(config), []);
    time = Date.parse((await get(row.id)).next_attempt_at);
    assert.deepEqual(await dispatchScopedOutboxRetry(config), [{ id: row.id, status: "failed" }]);
    assert.equal((await get(row.id)).attempts, 2);
  });

  await scenario("due selection skips future, leased and terminal records and honors batch bounds", async () => {
    const due = await insert();
    await insert({ next_attempt_at: iso(epoch + 1) });
    await insert({ status: "processing", locked_until: iso(epoch + 1) });
    await insert({ status: "sent" }); await insert({ status: "failed" });
    const reclaimed = await insert({ status: "processing", locked_until: iso(epoch) });
    const store = fixture.store();
    assert.deepEqual(new Set((await store.listDue(epoch, 100)).map((r) => r.id)), new Set([due.id, reclaimed.id]));
    assert.equal((await store.listDue(epoch, 1)).length, 1);
    assert.deepEqual(await store.claim(await get(reclaimed.id), epoch - 1, 1000, 5), { status: "contended" });
  });

  await scenario("two independent clients racing the same row acquire exactly one lease", async () => {
    const row = await insert();
    const [a, b] = [fixture.store(), fixture.store()];
    const results = await Promise.all([a.claim(row, epoch, 1000, 5), b.claim(row, epoch, 1000, 5)]);
    assert.deepEqual(results.map((r) => r.status).sort(), ["claimed", "contended"]);
    const claimed = results.find((r) => r.status === "claimed").record;
    assert.equal(claimed.attempts, 1);
    assert.equal(Date.parse(claimed.locked_until), epoch + 1000);
    assert.equal(await a.finish(claimed, epoch, { status: "sent", messageId: "receipt" }), true);
    assert.equal((await get(row.id)).locked_until, null);
    assert.equal(await b.finish(claimed, epoch, { status: "sent", messageId: "stale" }), false);
    assert.equal((await get(row.id)).provider_message_id, "receipt");
  });

  await scenario("expired leases can be reclaimed and stale owners cannot overwrite successors", async () => {
    const row = await insert(), store = fixture.store();
    const old = await store.claim(row, epoch, 1000, 5);
    time += 1000;
    assert.equal(await store.finish(old.record, time, { status: "sent", messageId: "expired" }), false);
    const next = await store.claim(await get(row.id), time, 1000, 5);
    assert.equal(next.record.attempts, 2);
    assert.equal(await store.finish(old.record, epoch, { status: "sent", messageId: "old" }), false);
    assert.equal(await store.finish(next.record, time, { status: "sent", messageId: "new" }), true);
  });

  await scenario("concurrent batches send once and persist receipt and cleared lease", async () => {
    const row = await insert(), mailer = createMockMailer();
    const results = (await Promise.all([dispatchOutboxBatch(options({ mailer })), dispatchOutboxBatch(options({ mailer }))])).flat();
    assert.equal(results.filter((r) => r.status === "sent").length, 1);
    assert.equal(mailer.deliveries.length, 1);
    const saved = await get(row.id);
    assert.equal(saved.status, "sent"); assert.equal(saved.attempts, 1);
    assert.equal(saved.provider_message_id, `mock:${row.event_id}`);
    assert.equal(saved.last_error, null); assert.equal(saved.locked_until, null);
    assert.deepEqual(await dispatchOutboxBatch(options({ mailer })), []);
  });

  await scenario("deferred delivery remains pending and never stores a sent receipt", async () => {
    const row = await insert(), mailer = createDeferredMailer();
    const config = options({ mailer, retry: { maxAttempts: 2 } });
    assert.deepEqual(await dispatchOutboxBatch(config), [{ id: row.id, status: "retry" }]);
    const pending = await get(row.id);
    assert.equal(pending.status, "pending");
    assert.equal(pending.provider_message_id, null);
    assert.equal(Date.parse(pending.next_attempt_at), epoch + 500);
    assert.deepEqual(await dispatchOutboxBatch(config), []);
    time = Date.parse(pending.next_attempt_at);
    assert.deepEqual(await dispatchOutboxBatch(config), [{ id: row.id, status: "failed" }]);
    assert.equal((await get(row.id)).provider_message_id, null);
    assert.deepEqual(mailer.deferrals.map(({ token }) => token), [`deferred:${row.event_id}`, `deferred:${row.event_id}`]);
  });

  await scenario("failures retry only when due, back off exponentially and terminate at max attempts", async () => {
    const row = await insert();
    let sends = 0;
    const config = options({ retry: { maxAttempts: 3 }, mailer: { send: async () => { sends++; throw new Error("secret customer@example.com"); } } });
    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await dispatchOutboxBatch(config);
      assert.equal(result[0].status, attempt === 3 ? "failed" : "retry");
      const saved = await get(row.id);
      assert.equal(saved.attempts, attempt); assert.equal(saved.locked_until, null);
      assert.doesNotMatch(saved.last_error, /secret|customer/);
      if (attempt < 3) {
        assert.equal(Date.parse(saved.next_attempt_at), time + 500 * 2 ** (attempt - 1));
        assert.deepEqual(await dispatchOutboxBatch(config), []);
        time = Date.parse(saved.next_attempt_at);
      }
    }
    time += 100000;
    assert.deepEqual(await dispatchOutboxBatch(config), []); assert.equal(sends, 3);
  });

  await scenario("crashed final attempt is dead-lettered without another delivery", async () => {
    const row = await insert({ status: "processing", attempts: 5, locked_until: iso(epoch - 1) });
    const config = options();
    assert.deepEqual(await dispatchOutboxBatch(config), [{ id: row.id, status: "failed" }]);
    assert.equal(config.mailer.deliveries.length, 0);
    const saved = await get(row.id);
    assert.equal(saved.status, "failed"); assert.equal(saved.attempts, 5); assert.equal(saved.locked_until, null);
  });

  await scenario("a failed render does not send and does not prevent later batch deliveries", async () => {
    await insert({ next_attempt_at: iso(epoch - 1) }); await insert();
    let renders = 0;
    const config = options({ buildMessage: async () => { if (++renders === 1) throw new Error("render failed"); return message; } });
    assert.deepEqual((await dispatchOutboxBatch(config)).map((r) => r.status), ["retry", "sent"]);
    assert.equal(config.mailer.deliveries.length, 1);
  });

  await scenario("render and send timeout are bounded, cancelled and retried", async () => {
    for (const phase of ["render", "send"]) {
      await db.exec("delete from email_outbox");
      const row = await insert();
      let signal, release;
      const stuck = new Promise((resolve) => { release = resolve; });
      const config = options({ deliveryTimeoutMs: 5, leaseMs: 1000 });
      if (phase === "render") config.buildMessage = async (_, activeSignal) => { signal = activeSignal; return stuck; };
      else config.mailer = { send: async (_, delivery) => { signal = delivery.signal; return stuck; } };
      assert.deepEqual(await dispatchOutboxBatch(config), [{ id: row.id, status: "retry" }]);
      assert.equal(signal.aborted, true);
      release(phase === "render" ? message : { messageId: "late" });
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal((await get(row.id)).status, "pending");
      if (phase === "render") assert.equal(config.mailer.deliveries.length, 0);
    }
  });

  await scenario("lost lease cannot be marked sent after slow delivery", async () => {
    const row = await insert();
    const config = options({ leaseMs: 1000, deliveryTimeoutMs: 500, mailer: { send: async () => { time += 1000; return { messageId: "late" }; } } });
    assert.deepEqual(await dispatchOutboxBatch(config), [{ id: row.id, status: "lease_lost" }]);
    assert.equal((await get(row.id)).status, "processing");
  });

  await scenario("persistence failure leaves recoverable lease and stable idempotency key", async () => {
    const row = await insert(), mailer = createMockMailer();
    const store = fixture.store();
    await assert.rejects(dispatchOutboxBatch(options({ mailer, store: { ...store, finish: async () => { throw new Error("storage offline"); } } })), /storage offline/);
    assert.equal((await get(row.id)).status, "processing");
    time += 60000;
    assert.deepEqual(await dispatchOutboxBatch(options({ mailer })), [{ id: row.id, status: "sent" }]);
    assert.equal(mailer.deliveries.length, 1);
    assert.equal((await get(row.id)).attempts, 2);
  });

  await scenario("invalid provider receipts retry instead of marking delivered", async () => {
    for (const receipt of [undefined, {}, { messageId: 42 }, { messageId: " " }, { messageId: "x\ny" }, { messageId: "x".repeat(513) },
      { deferred: true, token: " " }, { deferred: true, token: "x\ny" }]) {
      await db.exec("delete from email_outbox");
      await insert();
      assert.equal((await dispatchOutboxBatch(options({ mailer: { send: async () => receipt } })))[0].status, "retry");
    }
  });

  await scenario("graceful shutdown completes active delivery then stops claiming", async () => {
    await insert({ next_attempt_at: iso(epoch - 1) }); await insert();
    const controller = new AbortController(), mock = createMockMailer();
    const config = options({ signal: controller.signal, mailer: { send: async (...args) => { controller.abort(); return mock.send(...args); } } });
    await runOutboxWorker(config);
    assert.equal(mock.deliveries.length, 1);
    assert.equal((await fixture.store().listDue(time, 100)).length, 1);
    assert.deepEqual(await dispatchOutboxBatch(config), []);
  });

  await scenario("worker polls and wakes promptly when shutdown occurs during idle wait", async () => {
    const controller = new AbortController();
    let lists = 0;
    const store = fixture.store();
    await runOutboxWorker(options({ signal: controller.signal, pollIntervalMs: 1, store: { ...store, listDue: async (...args) => {
      lists++;
      if (lists === 2) setTimeout(() => controller.abort(), 5);
      return store.listDue(...args);
    } } }));
    assert.ok(lists >= 2);
  });
});

test("invalid worker options and already-aborted workers never access storage", async () => {
  const store = { listDue: async () => { assert.fail("Unexpected database access"); } };
  const options = { store, mailer: createMockMailer(), buildMessage: async () => message };
  for (const override of [{ batchSize: 0 }, { batchSize: 101 }, { leaseMs: 0 }, { deliveryTimeoutMs: 60000 }, { retry: { maxAttempts: -1 } }]) await assert.rejects(dispatchOutboxBatch({ ...options, ...override }));
  const signal = AbortSignal.abort();
  assert.deepEqual(await dispatchOutboxBatch({ ...options, signal }), []);
  await runOutboxWorker({ ...options, signal });
  await assert.rejects(runOutboxWorker({ ...options, signal, pollIntervalMs: 0 }));
});

test("outbox worker renders typed template payloads before delivery", async (t) => {
  const fixture = await database(t);
  const row = await fixture.insert();
  const mailer = createMockMailer();
  const result = await dispatchOutboxBatch({ store: fixture.store(), mailer, now: () => epoch,
    buildMessage: async () => ({ template: "customer_confirmation", data: { to: "customer@example.com", customerName: "Ari", reference: 42,
      items: [{ name: "Oak table", quantity: 1 }] } }) });
  assert.deepEqual(result, [{ id: row.id, status: "sent" }]);
  assert.equal(mailer.deliveries.length, 1);
  assert.match(mailer.deliveries[0].message.text, /Hello Ari/);
  assert.match(mailer.deliveries[0].message.html, /Oak table/);
});

test("database errors are sanitized for listing, claiming and saving", async () => {
  const client = createClient("https://outbox-test.invalid", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async () => new Response(JSON.stringify({ message: "private database detail", code: "42501" }), { status: 403, headers: { "content-type": "application/json" } }) },
  });
  const store = createSupabaseOutboxStore(client);
  const row = { id: randomUUID(), status: "pending", attempts: 0, next_attempt_at: iso(epoch), locked_until: null };
  const safe = (error) => /email outbox|email delivery/.test(error.message) && !error.message.includes("private");
  await assert.rejects(store.listDue(epoch, 1), safe);
  await assert.rejects(store.claim(row, epoch, 1000, 5), safe);
  await assert.rejects(store.finish({ ...row, status: "processing", locked_until: iso(epoch + 1000) }, epoch, { status: "sent", messageId: "receipt" }), safe);
  await assert.rejects(inspectOutboxHealth(client, epoch), (error) => error.message === "Unable to inspect email outbox.");
  await assert.rejects(getOutboxHealthSummary(client, epoch), (error) => error.message === "Unable to inspect email outbox.");
  await assert.rejects(dispatchScopedOutboxRetry({ client, ids: [row.id], mailer: createMockMailer(), buildMessage: async () => message, now: () => epoch }),
    (error) => error.message === "Unable to read email outbox for retry.");
});

test("health tolerates a pending row completing between count and age reads", async () => {
  const client = createClient("https://outbox-test.invalid", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, options) => {
      const { searchParams } = new URL(url);
      if (options.method === "HEAD") return new Response(null, { status: 200, headers: { "content-range": `*/${searchParams.get("status") === "eq.pending" ? 1 : 0}` } });
      assert.equal(options.method, "GET");
      assert.equal(searchParams.get("select"), "created_at");
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    } },
  });
  assert.deepEqual(await getOutboxHealthSummary(client, epoch), {
    total: 1, pending: 1, processing: 0, sent: 0, failed: 0, deadLetter: 0,
    retryBacklog: 0, oldestPendingAgeSeconds: null, failureRatePercent: 0,
  });
});

test("scoped retry rejects invalid selection before accessing storage", async () => {
  const client = createClient("https://outbox-test.invalid", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async () => { assert.fail("Unexpected database access"); } },
  });
  const config = { client, mailer: createMockMailer(), buildMessage: async () => message };
  await assert.rejects(dispatchScopedOutboxRetry({ ...config, ids: ["not-an-id"] }), /Invalid email outbox IDs/);
  await assert.rejects(dispatchScopedOutboxRetry({ ...config, ids: [randomUUID(), randomUUID()], batchSize: 1 }), /exceeds batch size/);
  assert.deepEqual(await dispatchScopedOutboxRetry({ ...config, ids: [] }), []);
});

test("retry database write errors are sanitized and never reach a transport", async () => {
  const row = { id: randomUUID(), status: "failed", attempts: 5, next_attempt_at: iso(epoch), locked_until: null };
  const client = createClient("https://outbox-test.invalid", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (_url, options) => options.method === "GET"
      ? new Response(JSON.stringify([row]), { status: 200, headers: { "content-type": "application/json" } })
      : new Response(JSON.stringify({ message: "private database detail", code: "42501" }), { status: 403, headers: { "content-type": "application/json" } }) },
  });
  const mailer = createMockMailer();
  await assert.rejects(dispatchScopedOutboxRetry({ client, ids: [row.id], mailer, buildMessage: async () => message, now: () => epoch }),
    (error) => error.message === "Unable to requeue email outbox record.");
  assert.equal(mailer.deliveries.length, 0);
});
