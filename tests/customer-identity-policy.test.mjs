import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { loadModule } from "./helpers/load-module.mjs";

const policy = loadModule("lib/auth/customer-policy.ts");
const ids = {
  first: "40000000-0000-0000-0000-000000000001",
  second: "40000000-0000-0000-0000-000000000002",
  staff: "40000000-0000-0000-0000-000000000003",
};
const session = (id) => id.replace("40000000-", "50000000-");

test("contact matches never claim guest inquiries without inquiry-specific proof", () => {
  const guest = { kind: "guest" };
  const first = { kind: "authenticated", userId: ids.first, email: "Owner@Example.com", emailVerified: true, sessionValid: true };
  const inquiryId = "60000000-0000-0000-0000-000000000001";
  const proof = { inquiryId, verifiedContactEmail: "owner@example.com", contactVerified: true };
  assert.equal(policy.inquiryCustomerLink(guest, inquiryId, "owner@example.com", proof), null);
  assert.equal(policy.inquiryCustomerLink(first, inquiryId, "owner@example.com", null), null);
  assert.equal(policy.inquiryCustomerLink(first, inquiryId, " OWNER@example.com ", proof), ids.first);
  assert.equal(policy.inquiryCustomerLink(first, inquiryId, "other@example.com", proof), null);
  assert.equal(policy.inquiryCustomerLink(first, inquiryId, "owner@example.com", { ...proof, inquiryId: ids.second }), null);
  assert.equal(policy.inquiryCustomerLink(first, inquiryId, "owner@example.com", { ...proof, contactVerified: false }), null);
  assert.equal(policy.inquiryCustomerLink(first, inquiryId, "owner@example.com", { ...proof, verifiedContactEmail: "other@example.com" }), null);
  assert.equal(policy.inquiryCustomerLink(first, inquiryId, "owner@example.com", proof, ids.second), null);
  assert.equal(policy.inquiryCustomerLink({ ...first, emailVerified: false }, inquiryId, "owner@example.com", proof), null);
  assert.equal(policy.inquiryCustomerLink({ ...first, sessionValid: false }, inquiryId, "owner@example.com", proof), null);
  assert.equal(policy.canReadCustomerInquiry(guest, ids.first), false);
  assert.equal(policy.canReadCustomerInquiry(first, ids.second), false);
  assert.equal(policy.canReadCustomerInquiry(first, ids.first), true);
  assert.equal(policy.canReadCustomerInquiry({ ...first, sessionValid: false }, ids.first), false);
  assert.equal(policy.canReadCustomerInquiry(guest, ids.first, true), true);
});

test("customer input validation retains only minimal profile fields", () => {
  assert.deepEqual(policy.parseCustomerProfileInput({ displayName: " Ada ", contactPhone: " +84 901234567 ", cardNumber: "123" }),
    { displayName: "Ada", contactPhone: "+84 901234567" });
  assert.deepEqual(policy.parseCustomerProfileInput({ displayName: "Ada" }), { displayName: "Ada", contactPhone: null });
  for (const value of [null, {}, { displayName: " " }, { displayName: "a".repeat(121) },
    { displayName: "Ada", contactPhone: "not a phone" }, { displayName: "Ada", contactPhone: 123 }]) {
    assert.equal(policy.parseCustomerProfileInput(value), null);
  }
  assert.equal(policy.normalizeCustomerEmail("  ADA@Example.com  "), "ada@example.com");
  assert.equal(policy.normalizeCustomerEmail("not-an-email"), null);
});

test("customer RLS protects profiles, wishlists and linked inquiries in isolated PostgreSQL", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users(id uuid primary key, email text);
    create table auth.sessions(id uuid primary key, user_id uuid not null references auth.users(id),
      created_at timestamptz not null default now(), not_after timestamptz);
    create table auth.refresh_tokens(session_id uuid);
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);
  const files = (await readdir(new URL("../supabase/migrations/", import.meta.url))).filter((name) => name.endsWith(".sql")).sort();
  for (const file of files) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
  for (const id of Object.values(ids)) {
    await db.query("insert into auth.users(id,email) values ($1,$2)", [id, `${id}@example.com`]);
    await db.query("insert into auth.sessions(id,user_id) values ($1,$2)", [session(id), id]);
  }
  await db.query("insert into public.admin_profiles(user_id,display_name,role) values ($1,'Staff','super_admin')", [ids.staff]);
  const category = (await db.query("insert into public.categories(name,slug) values ('Tables','tables') returning id")).rows[0].id;
  const product = (await db.query("insert into public.products(category_id,name,slug,description) values ($1,'Desk','desk','Oak desk') returning id", [category])).rows[0].id;
  const asset = (await db.query(`insert into public.media_assets(cloudinary_asset_id,public_id,secure_url,width,height,format,alt)
    values ('desk-asset','desk','https://res.cloudinary.com/example/image/upload/desk.jpg',100,100,'jpg','Oak desk') returning id`)).rows[0].id;
  await db.query("insert into public.product_images(product_id,asset_id,is_primary) values ($1,$2,true)", [product, asset]);
  await db.query("update public.products set status='published' where id=$1", [product]);
  const linked = (await db.query(`insert into public.inquiries(idempotency_key,contact_name,contact_phone,contact_email,original_submission,source,customer_user_id)
    values (gen_random_uuid(),'Owner','0901234567','owner@example.com','{}','contact',$1) returning id`, [ids.first])).rows[0].id;
  const guest = (await db.query(`insert into public.inquiries(idempotency_key,contact_name,contact_phone,contact_email,original_submission,source)
    values (gen_random_uuid(),'Guest','0901234567','owner@example.com','{}','contact') returning id`)).rows[0].id;
  await db.query("insert into public.inquiry_items(inquiry_id,product_name,product_slug,currency,quantity) values ($1,'Desk','desk','USD',1),($2,'Desk','desk','USD',1)", [linked, guest]);

  async function as(role, id, run, sessionId = id ? session(id) : null) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id ?? ""]);
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: id, session_id: sessionId })]);
    await db.exec(`set role ${role}`);
    try { return await run(); } finally {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub','',false)");
      await db.query("select set_config('request.jwt.claims','{}',false)");
    }
  }

  await as("anon", null, async () => {
    for (const table of ["customer_profiles", "customer_wishlist_items", "inquiries", "inquiry_items"]) {
      await assert.rejects(db.query(`select * from public.${table}`), { code: "42501" });
    }
  });
  await as("authenticated", ids.first, async () => {
    await db.query("insert into public.customer_profiles(user_id,display_name) values ($1,'Owner')", [ids.first]);
    assert.equal((await db.query("update public.customer_profiles set display_name='Updated' where user_id=$1 returning display_name", [ids.first])).rows[0].display_name, "Updated");
    await db.query("insert into public.customer_wishlist_items(user_id,product_id) values ($1,$2)", [ids.first, product]);
    assert.deepEqual((await db.query("select id from public.inquiries")).rows, [{ id: linked }]);
    assert.equal((await db.query("select id from public.inquiry_items")).rows.length, 1);
    assert.equal((await db.query("select user_id from public.customer_profiles")).rows.length, 1);
    assert.equal((await db.query("select product_id from public.customer_wishlist_items")).rows.length, 1);
    await assert.rejects(db.query("update public.inquiries set customer_user_id=$1 where id=$2", [ids.second, linked]), { code: "42501" });
    await assert.rejects(db.query("update public.customer_profiles set user_id=$1 where user_id=$2", [ids.second, ids.first]), { code: "42501" });
    await assert.rejects(db.query("update public.customer_wishlist_items set user_id=$1 where user_id=$2", [ids.second, ids.first]), { code: "42501" });
    await assert.rejects(db.query("insert into public.customer_profiles(user_id,display_name) values ($1,'Other')", [ids.second]), { code: "42501" });
    await assert.rejects(db.query("insert into public.customer_wishlist_items(user_id,product_id) values ($1,$2)", [ids.second, product]), { code: "42501" });
    await assert.rejects(db.query("update public.customer_profiles set contact_phone='------' where user_id=$1", [ids.first]), { code: "23514" });
  });
  await as("authenticated", ids.second, async () => {
    assert.equal((await db.query("select id from public.inquiries")).rows.length, 0);
    assert.equal((await db.query("select id from public.inquiry_items")).rows.length, 0);
    assert.equal((await db.query("select user_id from public.customer_profiles")).rows.length, 0);
    assert.equal((await db.query("select product_id from public.customer_wishlist_items")).rows.length, 0);
  });
  await as("authenticated", ids.first, async () => {
    assert.equal((await db.query("select id from public.inquiries")).rows.length, 0);
    assert.equal((await db.query("select product_id from public.customer_wishlist_items")).rows.length, 0);
  }, session(ids.second));
  await db.query("update auth.sessions set not_after=now() - interval '1 second' where id=$1", [session(ids.first)]);
  await as("authenticated", ids.first, async () => {
    assert.equal((await db.query("select id from public.inquiries")).rows.length, 0);
    assert.equal((await db.query("select user_id from public.customer_profiles")).rows.length, 0);
    assert.equal((await db.query("select product_id from public.customer_wishlist_items")).rows.length, 0);
  });
  await as("authenticated", ids.staff, async () => {
    assert.equal((await db.query("select id from public.inquiries")).rows.length, 2);
    assert.equal((await db.query("select id from public.inquiry_items")).rows.length, 2);
  });
  assert.notEqual(linked, guest);
});
