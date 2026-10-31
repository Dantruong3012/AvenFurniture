import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

// Synthetic fixtures only. This test has no HTTP client or Production credentials.
const migrationRoot = new URL("../supabase/migrations/", import.meta.url);
const baselineVersion = "20261015085103";
const uid = (n) => `51000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const sid = (n) => `52000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const quote = (name) => `"${name.replaceAll('"', '""')}"`;

async function bootstrap(db) {
  // Model SQL-facing Auth dependencies, not GoTrue, encryption or HTTP Auth.
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key, email text, encrypted_password text);
    create table auth.identities(id uuid primary key, user_id uuid references auth.users(id), provider text);
    create table auth.mfa_factors(id uuid primary key, user_id uuid references auth.users(id), secret text);
    create table auth.sessions(id uuid primary key, user_id uuid references auth.users(id),
      created_at timestamptz not null default now(), not_after timestamptz);
    create table auth.refresh_tokens(id bigint primary key, session_id uuid references auth.sessions(id));
    create table storage.buckets(id text primary key);
    create table storage.objects(id uuid primary key, bucket_id text references storage.buckets(id));
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  `);
}

async function seedBaseline(db) {
  for (let n = 1; n <= 3; n++) {
    await db.query("insert into auth.users values ($1,$2,$3)", [uid(n), `fixture${n}@example.test`, `synthetic-password-marker-${n}`]);
    await db.query("insert into auth.identities values ($1,$1,'email')", [uid(n)]);
    await db.query("insert into public.admin_profiles(user_id,display_name,role) values ($1,$2,$3)",
      [uid(n), `Fixture ${n}`, n < 3 ? "super_admin" : "staff"]);
  }
  await db.query("insert into auth.mfa_factors values ($1,$1,'synthetic-mfa-marker')", [uid(1)]);
  for (let n = 1; n <= 10; n++) {
    await db.query("insert into auth.sessions(id,user_id) values ($1,$2)", [sid(n), uid((n - 1) % 3 + 1)]);
    await db.query("insert into auth.refresh_tokens values ($1,$2)", [n, sid(n)]);
  }
  await db.query("insert into public.categories(id,name,slug) values ($1,'Fixture category','fixture-category')", [uid(10)]);
  for (let n = 1; n <= 3; n++) {
    await db.query(`insert into public.media_assets(id,cloudinary_asset_id,public_id,secure_url,width,height,format,alt,uploaded_by)
      values ($1,$2,$2,$3,100,100,'jpg','Fixture image',$4)`,
    [uid(10 + n), `fixture-asset-${n}`, `https://res.cloudinary.com/fixture/image/upload/fixture-${n}.jpg`, uid(n)]);
  }
}

async function snapshot(db, columns) {
  const result = {};
  for (const [relation, names] of Object.entries(columns)) {
    const table = relation.split(".").map(quote).join(".");
    result[relation] = (await db.query(`select to_jsonb(r) as row from (select ${names.map(quote).join(",")} from ${table}) r order by to_jsonb(r)::text`)).rows;
  }
  return result;
}

async function as(db, role, user, session, run) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? ""]);
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: user, session_id: session })]);
  await db.exec(`set role ${role}`);
  try { return await run(); } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    await db.query("select set_config('request.jwt.claims','{}',false)");
  }
}

test("upgrade the five-migration Production baseline without losing existing data", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await bootstrap(db);
  const files = (await readdir(migrationRoot)).filter((file) => file.endsWith(".sql")).sort();
  const baseline = files.filter((file) => file.slice(0, 14) <= baselineVersion);
  const pending = files.filter((file) => file.slice(0, 14) > baselineVersion);
  assert.equal(baseline.length, 5);
  assert.equal(pending.length, 10);
  for (const file of baseline) await db.exec(await readFile(new URL(file, migrationRoot), "utf8"));
  await seedBaseline(db);
  const columns = {};
  for (const row of (await db.query(`select table_schema,table_name,column_name from information_schema.columns
    where table_schema in ('public','private','auth','storage') order by table_schema,table_name,ordinal_position`)).rows) {
    (columns[`${row.table_schema}.${row.table_name}`] ??= []).push(row.column_name);
  }
  const before = await snapshot(db, columns);
  assert.equal(before["auth.users"].length, 3);
  assert.equal(before["auth.sessions"].length, 10);
  assert.equal(before["public.audit_logs"].length, 3);
  assert.equal(before["public.media_assets"].length, 3);
  assert.equal(before["public.products"].length, 0);
  const manifest = [];
  for (const file of pending) {
    const sql = await readFile(new URL(file, migrationRoot), "utf8");
    // One transaction per file, matching an incremental migration runner.
    await db.exec("begin");
    try { await db.exec(sql); await db.exec("commit"); } catch (error) { await db.exec("rollback"); throw error; }
    manifest.push({ file, sha256: createHash("sha256").update(sql).digest("hex") });
    assert.deepEqual(await snapshot(db, columns), before, `${file} must preserve every baseline row/column`);
  }
  t.diagnostic(`Applied ${manifest.length} pending migrations; all original columns/rows match after every commit.`);

  await t.test("existing accounts, live sessions, legacy staff and media remain usable", async () => {
    for (let n = 1; n <= 3; n++) {
      const context = await as(db, "authenticated", uid(n), sid(n), () => db.query("select public.get_admin_session_context() as value"));
      assert.equal(context.rows[0].value.role, n < 3 ? "super_admin" : "staff");
    }
    assert.deepEqual((await db.query("select active_count from private.admin_guard")).rows, [{ active_count: 2 }]);
    assert.ok((await db.query("select invite_email,invited_at from public.admin_profiles")).rows.every((row) => row.invite_email === null && row.invited_at === null));
    assert.equal((await as(db, "authenticated", uid(3), sid(3), () => db.query("select id from public.media_assets"))).rows.length, 3);
    assert.equal((await as(db, "anon", null, null, () => db.query("select * from public.products"))).rows.length, 0);
    assert.equal((await as(db, "anon", null, null, () => db.query("select * from public.list_public_consultants()"))).rows.length, 0);
    assert.equal((await db.query("select count(*)::int as count from public.email_outbox")).rows[0].count, 0);
    assert.equal((await db.query("select to_regclass('cron.job') as cron")).rows[0].cron, null);
  });

  await t.test("new tables and inquiry submission keep anonymous callers out", async () => {
    const tables = (await db.query("select tablename,rowsecurity from pg_tables where schemaname in ('public','private')")).rows;
    assert.equal(tables.length, 17);
    assert.ok(tables.every((row) => row.rowsecurity));
    for (const table of ["admin_profiles", "inquiries", "email_outbox", "customer_profiles", "customer_cart_items", "customer_wishlist_items", "newsletter_subscribers"]) {
      await assert.rejects(as(db, "anon", null, null, () => db.query(`select * from public.${table}`)), { code: "42501" });
    }
    const call = () => db.query("select * from public.submit_customer_inquiry($1,'Fixture','0901234567',null,'','contact','{}','[]')", [uid(30)]);
    await assert.rejects(as(db, "anon", null, null, call), { code: "42501" });
    await assert.rejects(as(db, "authenticated", uid(3), sid(3), call), { code: "42501" });
    const created = await as(db, "service_role", null, null, call);
    assert.equal(created.rows[0].is_duplicate, false);
    assert.equal((await as(db, "service_role", null, null, call)).rows[0].is_duplicate, true);
    assert.equal((await db.query("select count(*)::int as count from public.inquiries")).rows[0].count, 1);
    assert.equal((await db.query("select count(*)::int as count from public.email_outbox")).rows[0].count, 1);
  });

  await t.test("customer ownership remains session-bound after upgrade", async () => {
    const product = uid(40);
    await db.query("insert into public.products(id,category_id,name,slug,description) values ($1,$2,'Fixture chair','fixture-chair','Fixture chair')", [product, uid(10)]);
    await db.query("insert into public.product_images(product_id,asset_id,is_primary) values ($1,$2,true)", [product, uid(11)]);
    await db.query("update public.products set status='published' where id=$1", [product]);
    await as(db, "authenticated", uid(1), sid(1), async () => {
      await db.query("insert into public.customer_profiles(user_id,display_name) values ($1,'Fixture customer')", [uid(1)]);
      await db.query("insert into public.customer_cart_items(user_id,product_id,quantity) values ($1,$2,2)", [uid(1), product]);
      const wishlist = await db.query("insert into public.customer_wishlist_items(user_id,product_id) values ($1,$2) returning id", [uid(1), product]);
      assert.match(wishlist.rows[0].id, /^[0-9a-f-]{36}$/);
      await assert.rejects(db.query("insert into public.customer_cart_items(user_id,product_id,quantity) values ($1,$2,1)", [uid(2), product]), { code: "42501" });
    });
    for (const [user, session] of [[uid(2), sid(2)], [uid(1), sid(2)]]) {
      await as(db, "authenticated", user, session, async () => {
        for (const table of ["customer_profiles", "customer_cart_items", "customer_wishlist_items"]) {
          assert.equal((await db.query(`select * from public.${table}`)).rows.length, 0);
        }
      });
    }
    await as(db, "authenticated", uid(1), sid(1), async () => {
      assert.equal((await db.query("select quantity from public.customer_cart_items")).rows[0].quantity, 2);
      assert.equal((await db.query("select * from public.customer_wishlist_items")).rows.length, 1);
    });
  });

  await t.test("failed migration transaction rolls back DDL and fixture data together", async () => {
    await db.exec("begin");
    await db.exec("create table public.failed_upgrade_probe(id integer); insert into public.failed_upgrade_probe values (1)");
    await assert.rejects(db.exec("update public.admin_profiles set role='invalid'"), { code: "23514" });
    await db.exec("rollback");
    assert.equal((await db.query("select to_regclass('public.failed_upgrade_probe') as relation")).rows[0].relation, null);
    assert.deepEqual((await db.query("select role from public.admin_profiles order by user_id")).rows.map((row) => row.role), ["super_admin", "super_admin", "staff"]);
  });
});
