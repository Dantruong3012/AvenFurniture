import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createClient } from "@supabase/supabase-js";
import { loadModule } from "./helpers/load-module.mjs";

const { validateCustomerInquiryInput, inquiryError } = loadModule("lib/validation/inquiry.ts");
const id = "00000000-0000-4000-8000-000000000001";
const item = { productName: "Oak chair", productSlug: "oak-chair", quantity: 2, currency: "USD", unitPrice: 120.50 };
const input = (overrides = {}) => ({ contact_name: " Customer ", contact_phone: "+84 (90) 123-4567", source: "cart", items: [item], ...overrides });

test("inquiry validation normalizes contacts, preserves messages, strips untrusted fields and generates a UUID v4", () => {
  const result = validateCustomerInquiryInput(input({ message: "  Keep my message\n", contact_email: " customer@example.com ", status: "completed", original_submission: { injected: true } }));
  assert.equal(result.success, true);
  assert.equal(result.data.contact_name, "Customer");
  assert.equal(result.data.contact_email, "customer@example.com");
  assert.equal(result.data.message, "  Keep my message\n");
  assert.match(result.data.idempotency_key, /^[0-9a-f-]{14}4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(result.data.status, undefined);
  assert.equal(result.data.original_submission, undefined);
  assert.equal(validateCustomerInquiryInput(input({ idempotency_key: id })).data.idempotency_key, id);
  for (const source of ["cart", "product", "contact", "manual"]) {
    const valid = validateCustomerInquiryInput(input({ source, contact_email: " ", items: [] }));
    assert.equal(valid.success, true);
    assert.equal(valid.data.contact_email, null);
  }
  assert.equal(validateCustomerInquiryInput(input({ items: undefined })).data.items.length, 0);
});

test("inquiry validation rejects malformed contacts, UUIDs, spam and limits", () => {
  for (const value of [null, [], "text", 42]) assert.equal(validateCustomerInquiryInput(value).success, false);
  for (const hp_company of ["Bot Ltd", " ", null, [], 0]) assert.equal(validateCustomerInquiryInput(input({ hp_company })).success, false);
  for (const [field, values] of Object.entries({
    contact_name: [" ", "a".repeat(121), {}, "a\0b"],
    contact_phone: ["12345", "1".repeat(31), "abcdef", "------", "123/456", "12+3456"],
    contact_email: ["x@y", "a b@c.com", "a@@b.com", "a@b.com\nCc:other", "a".repeat(250) + "@b.com", 1],
    message: ["x".repeat(10001), {}, "x\0"],
    source: ["unknown", null, 3], idempotency_key: ["", null, "not-a-uuid", {}],
  })) for (const value of values) {
    const result = validateCustomerInquiryInput(input({ [field]: value }));
    assert.equal(result.success, false, `${field}: ${JSON.stringify(value)}`);
    assert.ok(result.fields[field]);
  }
  for (const contact_phone of ["123456", "0901234567", "+1 (555) 123-4567", "090.123.4567"]) assert.equal(validateCustomerInquiryInput(input({ contact_phone })).success, true);
  assert.equal(validateCustomerInquiryInput(input({ contact_name: "a".repeat(120), message: "x".repeat(10000), hp_company: "" })).success, true);
});

test("inquiry item validation enforces array, snapshot, quantity, currency and finite price bounds", () => {
  for (const items of [null, {}, "[]", Array(101).fill(item), [null], Array(1)]) assert.equal(validateCustomerInquiryInput(input({ items })).success, false);
  assert.equal(validateCustomerInquiryInput(input({ items: Array(100).fill(item) })).success, true);
  for (const [field, values] of Object.entries({
    productName: ["", "x".repeat(201), null], productSlug: ["", "bad/slug", "x".repeat(161)],
    productId: ["", "not-a-uuid"], quantity: [0, 1000, 1.5, "1", NaN, Infinity],
    currency: ["usd", "US", "USDD", "123"], unitPrice: [-1, NaN, Infinity, "10", undefined, 10000000000],
  })) for (const value of values) {
    const result = validateCustomerInquiryInput(input({ items: [{ ...item, [field]: value }] }));
    assert.equal(result.success, false, field);
    assert.ok(result.fields[`items.0.${field}`]);
  }
  for (const unitPrice of [null, 0, 9999999999.99]) assert.equal(validateCustomerInquiryInput(input({ items: [{ ...item, unitPrice, quantity: 999, productId: id }] })).success, true);
});

function repository(response = { data: [{ id, reference: 1, is_duplicate: false }], error: null }) {
  const calls = [];
  let clients = 0;
  return {
    calls, clients: () => clients,
    ...loadModule("lib/repositories/supabaseInquiryRepository.ts", {
      "server-only": {},
      "@/lib/supabase/admin": { createServiceClient: () => {
        clients++;
        return { rpc: async (name, args) => { calls.push({ name, args }); return response; } };
      } },
    }),
  };
}

test("submission repository validates before accessing service client and sends one atomic RPC", async () => {
  const repo = repository();
  for (const invalid of [input({ hp_company: "spam" }), input({ contact_phone: "bad" }), null]) await assert.rejects(repo.submitCustomerInquiry(invalid));
  assert.equal(repo.clients(), 0);
  assert.deepEqual(await repo.submitCustomerInquiry(input({ idempotency_key: id, status: "completed", assignee_id: id })), { id, reference: 1, is_duplicate: false });
  assert.equal(repo.calls.length, 1);
  const { name, args } = repo.calls[0];
  assert.equal(name, "submit_customer_inquiry");
  assert.equal(args.p_idempotency_key, id);
  assert.equal(args.p_contact_name, "Customer");
  assert.equal(args.p_contact_email, null);
  assert.equal(args.p_original_submission.status, undefined);
  assert.equal(args.p_original_submission.assignee_id, undefined);
  assert.equal(args.p_original_submission.hp_company, undefined);
  assert.deepEqual(args.p_items, [{ product_id: null, product_name: "Oak chair", product_slug: "oak-chair", quantity: 2, currency: "USD", unit_price: 120.50 }]);
  const duplicate = repository({ data: [{ id, reference: 1, is_duplicate: true }], error: null });
  assert.equal((await duplicate.submitCustomerInquiry(input({ idempotency_key: id }))).is_duplicate, true);
});

test("submission errors are actionable without leaking database details and empty RPC responses fail", async () => {
  for (const code of ["22023", "23503", "23514", "22P02", "42501", "unknown"]) {
    const repo = repository({ data: null, error: { code, message: "private database detail" } });
    await assert.rejects(repo.submitCustomerInquiry(input()), (error) => error.message === inquiryError(code) && !error.message.includes("private"));
  }
  for (const data of [null, [], [{ id: null, reference: 1 }]]) await assert.rejects(repository({ data, error: null }).submitCustomerInquiry(input()));
});

// Exercise the real Supabase query builder with an in-memory fetch stub, never HTTP.
function adminClient(responses) {
  const requests = [];
  const supabase = createClient("https://inquiry-test.invalid", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, options) => {
      requests.push({ url: new URL(url), ...options, body: options.body ? JSON.parse(options.body) : null });
      assert.ok(responses.length, "Unexpected database request");
      const { body, status = 200, headers = {} } = responses.shift();
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
    } },
  });
  return { supabase, requests };
}

test("admin repository uses caller client for paginated status/search queries, detail, updates and note authorship", async () => {
  const repo = repository();
  const row = { id, status: "new", assignee_id: null };
  const { supabase, requests } = adminClient([
    { body: [{ ...row, inquiry_items: [{ count: 2 }] }], headers: { "content-range": "2-2/3" } },
    { body: [{ ...row, inquiry_items: [item], inquiry_notes: [{ body: "note" }] }] },
    { body: [{ ...row, status: "consulting" }] }, { body: [row] },
    { body: { id, inquiry_id: id, author_id: id, body: "Note" } }, { body: [] },
  ]);
  const listed = await repo.listAdminInquiries(supabase, { page: 2, pageSize: 2, status: "new", q: 'a%,)"\\_' });
  assert.equal(listed.count, 3);
  assert.equal(listed.inquiries[0].item_count, 2);
  const params = requests[0].url.searchParams;
  assert.equal(params.get("select"), "*,inquiry_items(count)");
  assert.equal(params.get("offset"), "2"); assert.equal(params.get("limit"), "2");
  assert.equal(params.get("status"), "eq.new"); assert.equal(params.get("deleted_at"), "is.null");
  assert.equal(params.get("order"), "created_at.desc,id.desc");
  const literal = '"%a\\\\%,)\\"\\\\\\\\\\\\_%"';
  assert.equal(params.get("or"), `(contact_name.ilike.${literal},contact_phone.ilike.${literal},contact_email.ilike.${literal})`);
  assert.equal((await repo.getAdminInquiryById(supabase, id)).inquiry_notes[0].body, "note");
  assert.equal(requests[1].url.searchParams.get("id"), `eq.${id}`);
  assert.equal(requests[1].url.searchParams.get("inquiry_notes.order"), "created_at.asc,id.asc");
  await repo.updateAdminInquiryStatus(supabase, id, "consulting");
  assert.deepEqual(requests[2].body, { status: "consulting" });
  await repo.updateAdminInquiryStatus(supabase, id, undefined, null);
  assert.deepEqual(requests[3].body, { assignee_id: null });
  assert.equal((await repo.addAdminInquiryNote(supabase, id, " Note ")).body, "Note");
  assert.deepEqual(requests[4].body, { inquiry_id: id, body: "Note" });
  assert.equal(await repo.getAdminInquiryById(supabase, id), null);
  assert.equal(repo.clients(), 0);
});

test("admin repository rejects invalid mutations/filters before querying and surfaces missing/denied rows", async () => {
  const repo = repository();
  const { supabase, requests } = adminClient([]);
  for (const filters of [{ page: 0 }, { pageSize: 101 }, { page: 1.5 }, { status: "bad" }, { q: "x".repeat(201) }]) await assert.rejects(repo.listAdminInquiries(supabase, filters));
  await assert.rejects(repo.getAdminInquiryById(supabase, "bad"));
  await assert.rejects(repo.updateAdminInquiryStatus(supabase, id));
  await assert.rejects(repo.updateAdminInquiryStatus(supabase, id, "bad"));
  await assert.rejects(repo.updateAdminInquiryStatus(supabase, id, undefined, "bad"));
  for (const body of [" ", "x".repeat(10001), null]) await assert.rejects(repo.addAdminInquiryNote(supabase, id, body));
  assert.equal(requests.length, 0);
  const missing = adminClient([{ body: [] }]);
  await assert.rejects(repo.updateAdminInquiryStatus(missing.supabase, id, "completed"), /not found/);
  const denied = adminClient([{ status: 403, body: { code: "42501", message: "private detail" } }]);
  await assert.rejects(repo.addAdminInquiryNote(denied.supabase, id, "note"), /session or permissions/);
  assert.equal(repo.clients(), 0);
});

test("inquiry RPC and staff access on isolated PostgreSQL with all local migrations", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create table auth.sessions(id uuid primary key, user_id uuid not null references auth.users(id),
      created_at timestamptz not null default now(), not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);
  const files = (await readdir(new URL("../supabase/migrations/", import.meta.url))).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
  const staff = randomUUID(), session = randomUUID(), outsider = randomUUID();
  await db.query("insert into auth.users values ($1),($2)", [staff, outsider]);
  await db.query("insert into auth.sessions(id,user_id) values ($1,$2)", [session, staff]);
  await db.query("insert into public.admin_profiles(user_id,display_name,role) values ($1,'Staff','staff')", [staff]);
  const sqlItem = { product_id: null, product_name: "Oak chair", product_slug: "oak-chair", unit_price: 120.50, currency: "USD", quantity: 2 };
  const submit = async (key = randomUUID(), items = [sqlItem], overrides = {}) => {
    const args = { key, name: " Customer ", phone: " 0901234567 ", email: " customer@example.com ", message: "Message", source: "cart", original: { contact_name: "Customer", items }, ...overrides };
    const result = await db.query("select * from public.submit_customer_inquiry($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)",
      [args.key, args.name, args.phone, args.email, args.message, args.source, JSON.stringify(args.original), JSON.stringify(items)]);
    return result.rows[0];
  };
  async function as(role, user, fn) {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? ""]);
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: user, session_id: user === staff ? session : null })]);
    await db.exec(`set role ${role}`);
    try { return await fn(); } finally { await db.exec("reset role"); }
  }
  const counts = async () => (await db.query(`select
    (select count(*)::int from public.inquiries) inquiries,
    (select count(*)::int from public.inquiry_items) items,
    (select count(*)::int from public.email_outbox) outbox`)).rows[0];
  let created;
  const key = randomUUID();

  await t.test("service-only SECURITY DEFINER function uses an empty search path", async () => {
    const { rows: [fn] } = await db.query("select prosecdef, proconfig, proacl::text from pg_proc where oid='public.submit_customer_inquiry(uuid,text,text,text,text,text,jsonb,jsonb)'::regprocedure");
    assert.equal(fn.prosecdef, true); assert.deepEqual(fn.proconfig, ['search_path=""']);
    assert.match(fn.proacl, /service_role=X/); assert.doesNotMatch(fn.proacl, /(?:\{|,)=X/);
    for (const role of ["anon", "authenticated"]) await as(role, role === "authenticated" ? staff : null, async () => {
      await assert.rejects(submit(), (error) => error.code === "42501");
    });
    assert.deepEqual(await counts(), { inquiries: 0, items: 0, outbox: 0 });
  });
  await t.test("service submission inserts all rows and preserves snapshots", async () => {
    created = await as("service_role", null, () => submit(key));
    assert.equal(created.is_duplicate, false); assert.ok(created.reference > 0);
    assert.deepEqual(await counts(), { inquiries: 1, items: 1, outbox: 1 });
    const inquiry = (await db.query("select * from public.inquiries where id=$1", [created.id])).rows[0];
    assert.equal(inquiry.contact_name, "Customer"); assert.equal(inquiry.contact_phone, "0901234567");
    assert.equal(inquiry.contact_email, "customer@example.com"); assert.equal(inquiry.status, "new");
    assert.deepEqual(inquiry.original_submission.items, [sqlItem]);
    const savedItem = (await db.query("select * from public.inquiry_items where inquiry_id=$1", [created.id])).rows[0];
    assert.equal(Number(savedItem.unit_price), 120.50); assert.equal(savedItem.quantity, 2);
    const outbox = (await db.query("select * from public.email_outbox where inquiry_id=$1", [created.id])).rows[0];
    assert.equal(outbox.status, "pending"); assert.equal(outbox.attempts, 0); assert.ok(outbox.next_attempt_at);
  });
  await t.test("duplicate keys return original ID/reference without overwriting or duplicating children", async () => {
    const duplicate = await as("service_role", null, () => submit(key, [{ ...sqlItem, quantity: 8 }], { name: "Changed" }));
    assert.deepEqual(duplicate, { ...created, is_duplicate: true });
    assert.deepEqual(await counts(), { inquiries: 1, items: 1, outbox: 1 });
    assert.equal((await db.query("select contact_name from public.inquiries where id=$1", [created.id])).rows[0].contact_name, "Customer");
    assert.equal((await db.query("select quantity from public.inquiry_items where inquiry_id=$1", [created.id])).rows[0].quantity, 2);
  });
  await t.test("invalid items roll back parent, children and outbox, and the key can be retried", async () => {
    for (const invalid of [{ currency: "US" }, { unit_price: -1 }, { quantity: 0 }, { product_id: randomUUID() }, { product_id: "invalid" }]) {
      const retryKey = randomUUID(), before = await counts();
      await assert.rejects(as("service_role", null, () => submit(retryKey, [sqlItem, { ...sqlItem, ...invalid }])), (error) => ["23514", "23503", "22P02"].includes(error.code));
      assert.deepEqual(await counts(), before);
      assert.equal((await db.query("select id from public.inquiries where idempotency_key=$1", [retryKey])).rows.length, 0);
      assert.equal((await as("service_role", null, () => submit(retryKey, []))).is_duplicate, false);
    }
  });
  await t.test("outbox failure also rolls back the parent and items", async () => {
    await db.exec(`create function public.test_outbox_failure() returns trigger language plpgsql as $$
      begin raise exception 'test outbox failure'; end $$;
      create trigger test_outbox_failure before insert on public.email_outbox for each row execute function public.test_outbox_failure();`);
    const before = await counts();
    try {
      await assert.rejects(as("service_role", null, () => submit()), /test outbox failure/);
      assert.deepEqual(await counts(), before);
    } finally { await db.exec("drop trigger test_outbox_failure on public.email_outbox; drop function public.test_outbox_failure()"); }
  });
  await t.test("SQL rejects invalid parent fields and item containers without partial writes", async () => {
    for (const overrides of [{ key: null }, { name: " " }, { name: "x".repeat(121) }, { phone: "12345" }, { email: "bad" }, { message: "x".repeat(10001) }, { source: "invalid" }, { original: [] }, { original: null }]) {
      const before = await counts();
      await assert.rejects(as("service_role", null, () => submit(randomUUID(), [], overrides)), (error) => error.code === "22023");
      assert.deepEqual(await counts(), before);
    }
    for (const items of [{}, Array(101).fill(sqlItem)]) {
      const before = await counts();
      await assert.rejects(as("service_role", null, () => submit(randomUUID(), items)), (error) => error.code === "22023");
      assert.deepEqual(await counts(), before);
    }
    for (const items of [[], null, Array(100).fill(sqlItem)]) assert.equal((await as("service_role", null, () => submit(randomUUID(), items))).is_duplicate, false);
  });
  await t.test("authenticated staff can list/count/detail, update status/assignee and add notes with their own author", () => as("authenticated", staff, async () => {
    const listed = await db.query(`select i.id, (select count(*)::int from public.inquiry_items x where x.inquiry_id=i.id) item_count
      from public.inquiries i where deleted_at is null and status='new' and contact_name ilike '%Customer%'
      order by created_at desc,id desc limit 25 offset 0`);
    assert.ok(listed.rows.some((row) => row.id === created.id && row.item_count === 1));
    const updated = await db.query("update public.inquiries set status='consulting',assignee_id=$2 where id=$1 returning *", [created.id, staff]);
    assert.equal(updated.rows[0].status, "consulting"); assert.equal(updated.rows[0].assignee_id, staff);
    const note = await db.query("insert into public.inquiry_notes(inquiry_id,body) values ($1,'Called customer') returning *", [created.id]);
    assert.equal(note.rows[0].author_id, staff);
    assert.equal((await db.query("select * from public.inquiry_items where inquiry_id=$1", [created.id])).rows.length, 1);
    assert.equal((await db.query("select * from public.inquiry_notes where inquiry_id=$1", [created.id])).rows.length, 1);
    await assert.rejects(db.query("update public.inquiries set message='changed' where id=$1", [created.id]), (error) => error.code === "42501");
    await assert.rejects(db.query("insert into public.inquiry_notes(inquiry_id,body,author_id) values ($1,'spoof',$2)", [created.id, outsider]), (error) => error.code === "42501");
  }));
  await t.test("unprovisioned and revoked sessions cannot read or mutate inquiries", async () => {
    const denied = async (user) => as("authenticated", user, async () => {
      for (const table of ["inquiries", "inquiry_items", "inquiry_notes"]) assert.equal((await db.query(`select * from public.${table}`)).rows.length, 0);
      assert.equal((await db.query("update public.inquiries set status='completed' where id=$1 returning id", [created.id])).rows.length, 0);
      await assert.rejects(db.query("insert into public.inquiry_notes(inquiry_id,body) values ($1,'denied')", [created.id]), (error) => error.code === "42501");
    });
    await denied(outsider);
    await db.query("delete from auth.sessions where id=$1", [session]);
    await denied(staff);
  });
});
