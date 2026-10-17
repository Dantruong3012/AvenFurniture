import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const ids = {
  admin: "00000000-0000-0000-0000-000000000001",
  staff: "00000000-0000-0000-0000-000000000002",
  blocked: "00000000-0000-0000-0000-000000000003",
  outsider: "00000000-0000-0000-0000-000000000004",
  secondAdmin: "00000000-0000-0000-0000-000000000005",
};

test("MVP migration and RLS on isolated PostgreSQL", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  // Emulate only Supabase's SQL-facing roles and auth.uid(), not GoTrue/HTTP.
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text);
    create table auth.sessions(id uuid primary key, user_id uuid not null references auth.users(id),
      created_at timestamptz not null default now(), not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    -- Simulate permissive legacy defaults: migration must revoke them.
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  `);
  const files = (await readdir(new URL("../supabase/migrations/", import.meta.url))).filter((f) => f.endsWith(".sql")).sort();
  await db.exec("begin");
  for (const file of files) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
  await db.exec("commit");
  const sessionIds = Object.fromEntries(Object.entries(ids).map(([name, id]) => [name, id.replace("00000000-", "10000000-")]));
  for (const [name, id] of Object.entries(ids)) {
    await db.query("insert into auth.users values ($1,$2)", [id, `${name}@example.com`]);
    await db.query("insert into auth.sessions(id,user_id) values ($1,$2)", [sessionIds[name], id]);
  }
  await db.query(`insert into public.admin_profiles(user_id, display_name, role, active) values
    ($1, 'Admin', 'super_admin', true), ($2, 'Staff', 'staff', true), ($3, 'Blocked', 'staff', false)`,
  [ids.admin, ids.staff, ids.blocked]);
  const category = (await db.query("insert into public.categories(name,slug) values ('Chairs','chairs') returning id")).rows[0].id;
  const asset = (await db.query(`insert into public.media_assets(cloudinary_asset_id,public_id,secure_url,width,height,format,alt)
    values ('asset','chair','https://res.cloudinary.com/example/image/upload/chair.jpg',100,100,'jpg','Oak chair') returning id`)).rows[0].id;
  const published = (await db.query(`insert into public.products(category_id,name,slug,description,status,price)
    values ($1,'Chair','chair','Oak chair','draft',120) returning id`, [category])).rows[0].id;
  await db.query("insert into public.product_images(product_id,asset_id,is_primary) values ($1,$2,true)", [published, asset]);
  await db.query("update public.products set status='published' where id=$1", [published]);
  const draft = (await db.query(`insert into public.products(category_id,name,slug) values ($1,'Draft','draft') returning id`, [category])).rows[0].id;
  const inquiry = (await db.query(`insert into public.inquiries(idempotency_key,contact_name,contact_phone,original_submission,source)
    values (gen_random_uuid(),'Customer','0901234567','{"name":"Customer"}','contact') returning id`)).rows[0].id;
  const changeInquiry = (await db.query(`insert into public.inquiries(idempotency_key,contact_name,contact_phone,contact_email,original_submission,source)
    values (gen_random_uuid(),'Email Customer','0901234567','customer@example.com','{}','contact') returning id`)).rows[0].id;
  await db.query(`insert into public.inquiry_items(inquiry_id,product_id,product_name,product_slug,currency,quantity)
    values ($1,$2,'Chair','chair','USD',1)`, [inquiry, published]);
  await db.query(`insert into public.consultant_profiles(user_id,public_name,zalo_phone,enabled)
    values ($1,'Consultant','0901234567',true),($2,'Hidden','0909999999',true)`, [ids.staff, ids.blocked]);

  async function as(role, id, fn, sessionId = id?.replace("00000000-", "10000000-")) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? ""]);
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: id, session_id: sessionId })]);
    await db.exec(`set role ${role}`);
    try { return await fn(); } finally { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub', '', false)"); await db.query("select set_config('request.jwt.claims', '{}', false)"); }
  }
  const rejects = (sql, params = [], code = "42501") => assert.rejects(db.query(sql, params), (error) =>
    code === "23503" ? ["23503", "23001"].includes(error.code) : error.code === code);

  await t.test("all thirteen public tables have RLS enabled", async () => {
    const { rows } = await db.query("select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'");
    assert.equal(rows.length, 13);
    assert.ok(rows.every((row) => row.relrowsecurity));
  });
  await t.test("newsletter roster requires a current staff session", async () => {
    await as("service_role", null, () => db.query(
      "select public.subscribe_newsletter($1,$2,$3,$4,$5,$6)",
      ["reader@example.com", "newsletter_form", "2026-10", "a".repeat(64), null, null],
    ));
    for (const [role, id] of [["anon", null], ["authenticated", ids.outsider], ["authenticated", ids.blocked]]) {
      await as(role, id, async () => {
        if (role === "anon") await rejects("select email from public.newsletter_subscribers");
        else assert.equal((await db.query("select email from public.newsletter_subscribers")).rows.length, 0);
        await rejects("update public.newsletter_subscribers set status='unsubscribed'");
      });
    }
    await as("authenticated", ids.staff, async () => {
      assert.deepEqual((await db.query("select email from public.newsletter_subscribers")).rows, [{ email: "reader@example.com" }]);
    });
    await db.query("delete from auth.sessions where id=$1", [sessionIds.staff]);
    await as("authenticated", ids.staff, async () => {
      assert.equal((await db.query("select email from public.newsletter_subscribers")).rows.length, 0);
    });
    await db.query("insert into auth.sessions(id,user_id) values ($1,$2)", [sessionIds.staff, ids.staff]);
    await db.query("delete from public.newsletter_subscribers where email='reader@example.com'");
  });
  await t.test("anonymous reads published catalog and media only; private tables/mutations denied", () => as("anon", null, async () => {
    assert.deepEqual((await db.query("select id from public.products")).rows, [{ id: published }]);
    assert.equal((await db.query("select * from public.media_assets")).rows.length, 1);
    for (const table of ["admin_profiles", "inquiries", "inquiry_items", "inquiry_notes", "audit_logs", "email_outbox", "consultant_profiles", "newsletter_subscribers"]) {
      await rejects(`select * from public.${table}`);
    }
    await rejects("update public.products set name='Hacked'");
    await rejects("select private.current_admin_role()");
  }));
  await t.test("consultant API excludes disabled accounts and internal identity", () => as("anon", null, async () => {
    const { rows } = await db.query("select * from public.list_public_consultants()");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].public_name, "Consultant");
    assert.deepEqual(Object.keys(rows[0]).sort(), ["avatar_url", "public_name", "sort_order", "zalo_phone"]);
  }));
  await t.test("unprovisioned authenticated users gain no staff privileges", () => as("authenticated", ids.outsider, async () => {
    assert.equal((await db.query("select * from public.inquiries")).rows.length, 0);
    assert.equal((await db.query("select * from public.admin_profiles")).rows.length, 0);
    assert.equal((await db.query("update public.products set name='Hacked' returning id")).rows.length, 0);
    await rejects("insert into public.admin_profiles(user_id,display_name,role) values ($1,'Hacker','super_admin')", [ids.outsider]);
  }));
  await t.test("staff can edit others' products/inquiries, but cannot elevate roles/manage categories", () => as("authenticated", ids.staff, async () => {
    assert.equal((await db.query("select * from public.products")).rows.length, 2);
    assert.equal((await db.query("update public.products set name='Updated' where id=$1 returning version", [draft])).rows[0].version, 2);
    await rejects("update public.inquiries set status='consulting' where id=$1", [inquiry]);
    assert.equal((await db.query("update public.inquiries set contact_name='Corrected' where id=$1 returning id", [inquiry])).rows.length, 1);
    assert.equal((await db.query("update public.admin_profiles set role='super_admin' where user_id=$1 returning user_id", [ids.staff])).rows.length, 0);
    assert.equal((await db.query("update public.categories set name='Hacked' returning id")).rows.length, 0);
    assert.equal((await db.query("update public.consultant_profiles set enabled=false returning user_id")).rows.length, 0);
    await rejects("insert into public.categories(name,slug) values ('Bad','bad')");
    await rejects("update public.inquiries set original_submission='{}' where id=$1", [inquiry]);
    await rejects("delete from public.inquiries where id=$1", [inquiry]);
    await rejects("update public.email_outbox set status='sent'");
    await rejects("insert into public.audit_logs(action,entity_table,entity_id) values ('fake','products',$1)", [published]);
    await rejects("update public.inquiry_items set quantity=999");
    await rejects("insert into public.inquiry_notes(inquiry_id,author_id,body) values ($1,$2,'Forged')", [inquiry, ids.admin]);
    assert.equal((await db.query("insert into public.inquiry_notes(inquiry_id,body) values ($1,'Follow up') returning id", [inquiry])).rows.length, 1);
    assert.equal((await db.query("select * from public.audit_logs")).rows.length, 0);
  }));
  await t.test("change RPCs atomically queue unique events and audit assignment", async () => {
    const rows = () => db.query("select event_type,payload,idempotency_key,event_id from public.email_outbox where inquiry_id=$1 order by created_at,id", [changeInquiry]);
    await as("authenticated", ids.staff, async () => {
      await db.query("select public.change_inquiry_status($1,'consulting')", [changeInquiry]);
      await db.query("select public.change_inquiry_status($1,'consulting')", [changeInquiry]);
      await db.query("select public.change_inquiry_assignment($1,$2,$3)", [changeInquiry, ids.staff, `http://localhost:3000/admin/inquiries?inquiry=${changeInquiry}`]);
      await db.query("select public.change_inquiry_assignment($1,$2,$3)", [changeInquiry, ids.staff, `http://localhost:3000/admin/inquiries?inquiry=${changeInquiry}`]);
    });
    const events = (await rows()).rows;
    assert.deepEqual(events.map((event) => event.event_type).sort(), ["inquiry.assigned", "inquiry.status_changed"]);
    assert.equal(new Set(events.map((event) => event.idempotency_key)).size, 2);
    for (const event of events) {
      assert.equal(event.idempotency_key,
        createHash("sha256").update(`email:v1\0${event.event_type}\0${event.event_id}`).digest("hex"));
    }
    assert.equal(events.find((event) => event.event_type === "inquiry.assigned").payload.data.to, "staff@example.com");
    assert.equal(events.find((event) => event.event_type === "inquiry.status_changed").payload.data.status, "consulting");
    const audits = (await db.query("select action,actor_id from public.audit_logs where entity_id=$1", [changeInquiry])).rows;
    assert.deepEqual(audits, [{ action: "inquiry_assigned", actor_id: ids.staff }]);
    await db.exec(`create function public.fail_change_outbox() returns trigger language plpgsql as $$ begin raise exception 'outbox failed'; end $$;
      create trigger fail_change_outbox before insert on public.email_outbox for each row execute function public.fail_change_outbox();`);
    try {
      await assert.rejects(as("authenticated", ids.staff, () => db.query("select public.change_inquiry_status($1,'completed')", [changeInquiry])), /outbox failed/);
      assert.equal((await db.query("select status from public.inquiries where id=$1", [changeInquiry])).rows[0].status, "consulting");
      assert.equal((await rows()).rows.length, 2);
    } finally { await db.exec("drop trigger fail_change_outbox on public.email_outbox; drop function public.fail_change_outbox()"); }
    await as("authenticated", ids.staff, () => db.query("select public.change_inquiry_assignment($1,null,null)", [changeInquiry]));
    const auditCount = (await db.query("select count(*)::int count from public.audit_logs where entity_id=$1", [changeInquiry])).rows[0].count;
    await db.exec(`create function public.fail_assignment_outbox() returns trigger language plpgsql as $$ begin raise exception 'assignment outbox failed'; end $$;
      create trigger fail_assignment_outbox before insert on public.email_outbox for each row execute function public.fail_assignment_outbox();`);
    try {
      await assert.rejects(as("authenticated", ids.staff, () => db.query("select public.change_inquiry_assignment($1,$2,$3)",
        [changeInquiry, ids.staff, `http://localhost:3000/admin/inquiries?inquiry=${changeInquiry}`])), /assignment outbox failed/);
      assert.equal((await db.query("select assignee_id from public.inquiries where id=$1", [changeInquiry])).rows[0].assignee_id, null);
      assert.equal((await db.query("select count(*)::int count from public.audit_logs where entity_id=$1", [changeInquiry])).rows[0].count, auditCount);
    } finally { await db.exec("drop trigger fail_assignment_outbox on public.email_outbox; drop function public.fail_assignment_outbox()"); }
  });
  await t.test("account lock invalidates staff access for the same JWT subject", async () => {
    await db.query("update public.admin_profiles set active=false where user_id=$1", [ids.staff]);
    await as("authenticated", ids.staff, async () => {
      assert.equal((await db.query("select * from public.inquiries")).rows.length, 0);
      assert.equal((await db.query("select * from public.products")).rows.length, 1);
      assert.equal((await db.query("update public.products set name='Hacked' returning id")).rows.length, 0);
    });
    await as("anon", null, async () => assert.equal((await db.query("select * from public.list_public_consultants()")).rows.length, 0));
    await db.query("update public.admin_profiles set active=true where user_id=$1", [ids.staff]);
  });
  await t.test("last active super_admin cannot be locked, demoted, deleted, or removed through Auth", () => as("authenticated", ids.admin, async () => {
    await rejects("update public.admin_profiles set active=false where user_id=$1", [ids.admin], "23514");
    await rejects("update public.admin_profiles set role='staff' where user_id=$1", [ids.admin], "23514");
    await rejects("delete from public.admin_profiles where user_id=$1", [ids.admin], "23514");
    await rejects("update private.admin_guard set active_count=100");
    const { rows } = await db.query("select * from public.audit_logs where action='contact_updated'");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].changes.before.name, "Customer");
    assert.equal(rows[0].changes.after.name, "Corrected");
  }));
  await t.test("counter supports handover; multirow demotion rolls back atomically", async () => {
    await db.query("insert into public.admin_profiles(user_id,display_name,role) values ($1,'Second','super_admin')", [ids.secondAdmin]);
    await rejects("update public.admin_profiles set active=false where role='super_admin'", [], "23514");
    assert.equal((await db.query("select active_count from private.admin_guard")).rows[0].active_count, 2);
    await db.query("update public.admin_profiles set role='staff' where user_id=$1", [ids.secondAdmin]);
    assert.equal((await db.query("select active_count from private.admin_guard")).rows[0].active_count, 1);
    await rejects("delete from auth.users where id=$1", [ids.admin], "23503");
  });
  await t.test("database constraints retain history and reject invalid values", async () => {
    await rejects("delete from public.categories where id=$1", [category], "23503");
    await rejects("delete from public.products where id=$1", [published], "23503");
    await rejects("update public.products set price=-1 where id=$1", [published], "23514");
    await rejects("update public.products set price='NaN' where id=$1", [published], "23514");
    await rejects("update public.inquiry_items set quantity=0", [], "23514");
    await rejects("update public.inquiries set message='rewrite original' where id=$1", [inquiry], "23514");
    await rejects("update public.products set slug='draft' where id=$1", [published], "23505");
  });
  const context = async () => (await db.query("select public.get_admin_session_context() as context")).rows[0].context;
  const renewStaffSession = async () => db.query("update auth.sessions set created_at=statement_timestamp(),not_after=null where id=$1", [sessionIds.staff]);
  await renewStaffSession();
  await t.test("RPC exposes only current role/expiry and denies direct Auth session reads", () => as("authenticated", ids.staff, async () => {
    const value = await context();
    assert.equal(value.role, "staff");
    assert.deepEqual(Object.keys(value).sort(), ["expires_at", "role"]);
    await rejects("select * from auth.sessions");
    await rejects("update public.admin_profiles set sessions_revoked_before=null where user_id=$1", [ids.staff]);
  }));
  await t.test("anon cannot invoke the session context or role helpers", () => as("anon", null, async () => {
    await rejects("select public.get_admin_session_context()");
    await rejects("select private.admin_session_context()");
  }));
  await t.test("missing, malformed and another user's session IDs cannot authorize", async () => {
    for (const sessionId of [null, "invalid-uuid", sessionIds.admin, "20000000-0000-0000-0000-000000000099"]) {
      await as("authenticated", ids.staff, async () => {
        assert.equal(await context(), null);
        assert.equal((await db.query("select * from public.admin_profiles")).rows.length, 0);
        assert.equal((await db.query("select * from public.inquiries")).rows.length, 0);
      }, sessionId);
    }
  });
  await t.test("fixed seven-day boundary does not extend with a fresh JWT", async () => {
    // Temporarily clear the cutoff by using a separate user that was never locked.
    await db.query("update auth.sessions set created_at=statement_timestamp()-interval '604740 seconds' where id=$1", [sessionIds.admin]);
    await as("authenticated", ids.admin, async () => assert.equal((await context()).role, "super_admin"));
    await db.query("update auth.sessions set created_at=statement_timestamp()-interval '604800 seconds' where id=$1", [sessionIds.admin]);
    await as("authenticated", ids.admin, async () => {
      assert.equal(await context(), null);
      for (const table of ["admin_profiles", "inquiries", "inquiry_items", "inquiry_notes", "email_outbox", "audit_logs", "consultant_profiles"]) {
        assert.equal((await db.query(`select * from public.${table}`)).rows.length, 0, table);
      }
      for (const table of ["products", "categories", "product_images", "slug_redirects"]) {
        assert.equal((await db.query(`delete from public.${table} returning *`)).rows.length, 0, table);
      }
      await rejects("update public.media_assets set alt='unauthorized'");
    });
    await db.query("update auth.sessions set created_at=statement_timestamp() where id=$1", [sessionIds.admin]);
  });
  await t.test("not_after is an additional upper bound; missing bound uses seven days", async () => {
    await db.query("update auth.sessions set not_after=statement_timestamp()+interval '1 hour' where id=$1", [sessionIds.staff]);
    const deadline = (await db.query("select not_after::text as not_after from auth.sessions where id=$1", [sessionIds.staff])).rows[0].not_after;
    await as("authenticated", ids.staff, async () => assert.equal(Date.parse((await context()).expires_at), Date.parse(deadline)));
    await db.query("update auth.sessions set not_after=statement_timestamp() where id=$1", [sessionIds.staff]);
    await as("authenticated", ids.staff, async () => assert.equal(await context(), null));
    await renewStaffSession();
  });
  await t.test("logout revokes only the removed session, while another device remains valid", async () => {
    const secondSession = "20000000-0000-0000-0000-000000000002";
    await db.query("insert into auth.sessions(id,user_id) values ($1,$2)", [secondSession, ids.staff]);
    await db.query("delete from auth.sessions where id=$1", [sessionIds.staff]);
    await as("authenticated", ids.staff, async () => assert.equal(await context(), null));
    await as("authenticated", ids.staff, async () => assert.equal((await context()).role, "staff"), secondSession);
    // Simulate successful global sign-out by GoTrue, not an application SQL API.
    await db.query("delete from auth.sessions where user_id=$1", [ids.staff]);
    await as("authenticated", ids.staff, async () => assert.equal(await context(), null), secondSession);
    await db.query("insert into auth.sessions(id,user_id) values ($1,$2)", [sessionIds.staff, ids.staff]);
  });
  await t.test("role changes are live; unlocking never resurrects pre-lock sessions", async () => {
    await db.query("update public.admin_profiles set role='super_admin' where user_id=$1", [ids.staff]);
    await as("authenticated", ids.staff, async () => assert.equal((await context()).role, "super_admin"));
    await db.query("update public.admin_profiles set role='staff' where user_id=$1", [ids.staff]);
    await as("authenticated", ids.staff, async () => assert.equal((await context()).role, "staff"));
    await db.query("update public.admin_profiles set active=false where user_id=$1", [ids.staff]);
    await as("authenticated", ids.staff, async () => assert.equal(await context(), null));
    await db.query("update public.admin_profiles set active=true where user_id=$1", [ids.staff]);
    await as("authenticated", ids.staff, async () => assert.equal(await context(), null));
    await renewStaffSession();
    await as("authenticated", ids.staff, async () => assert.equal((await context()).role, "staff"));
  });
  await t.test("archived catalog hides images and unused media from anonymous users", async () => {
    await db.query("update public.products set status='archived' where id=$1", [published]);
    await as("anon", null, async () => {
      for (const table of ["products", "product_images", "media_assets"]) assert.equal((await db.query(`select * from public.${table}`)).rows.length, 0);
    });
  });
  await t.test("category CRUD is super-admin only and category FK prevents accidental deletion", async () => {
    await as("authenticated", ids.admin, async () => {
      const c = (await db.query("insert into public.categories(name,slug) values ('Phase1','phase1') returning id")).rows[0].id;
      assert.equal((await db.query("update public.categories set name='Renamed' where id=$1 returning name", [c])).rows[0].name, "Renamed");
      assert.equal((await db.query("delete from public.categories where id=$1 returning id", [c])).rows.length, 1);
      await rejects("delete from public.categories where id=$1", [category], "23503");
    });
  });
  await t.test("product transaction honors RLS, optimistic version, image rollback and slug history", async () => {
    const payload = { name: "Phase1", slug: "phase1-product", description: "Oak", category_id: category, price: null,
      currency: "USD", attributes: { material: "Oak" }, featured: false, status: "draft", seo_title: null, seo_description: null };
    const save = async (id, version, data, assets = []) => (await db.query("select public.save_catalog_product($1,$2,$3,$4) as id", [id, version, JSON.stringify(data), assets])).rows[0].id;
    await as("anon", null, () => assert.rejects(save(null, null, payload), (e) => e.code === "42501"));
    await as("authenticated", ids.outsider, () => assert.rejects(save(null, null, payload), (e) => e.code === "42501"));
    await as("authenticated", ids.staff, async () => {
      const id = await save(null, null, payload, [asset]);
      assert.equal((await db.query("select is_primary from public.product_images where product_id=$1", [id])).rows[0].is_primary, true);
      const renamed = { ...payload, slug: "phase1-renamed", status: "published" };
      await save(id, 1, renamed, [asset]);
      assert.equal((await db.query("select product_id from public.slug_redirects where old_slug=$1", [payload.slug])).rows[0].product_id, id);
      await assert.rejects(save(id, 1, renamed, [asset]), (e) => e.code === "PT409");
      await assert.rejects(save(null, null, payload), (e) => e.code === "23505");
      await assert.rejects(save(id, 2, { ...renamed, slug: "should-rollback" }, ["ffffffff-ffff-ffff-ffff-ffffffffffff"]), (e) => ["23503", "23001", "23514"].includes(e.code));
      assert.equal((await db.query("select version,slug from public.products where id=$1", [id])).rows[0].version, 2);
      assert.equal((await db.query("select * from public.slug_redirects where old_slug='phase1-renamed'")).rows.length, 0);
      assert.equal((await db.query("select * from public.product_images where product_id=$1", [id])).rows.length, 1);
      await save(id, 2, payload); // Restore own original slug, no redirect cycle.
      assert.equal((await db.query("select * from public.slug_redirects where old_slug=$1", [payload.slug])).rows.length, 0);
      assert.equal((await db.query("select * from public.slug_redirects where old_slug='phase1-renamed'")).rows.length, 1);
      await rejects("insert into public.slug_redirects(old_slug,product_id) values ($1,$2)", [payload.slug, id], "23505");
      assert.equal((await db.query("delete from public.products where id=$1 and version=2 returning id", [id])).rows.length, 0);
      assert.equal((await db.query("delete from public.products where id=$1 and version=3 returning id", [id])).rows.length, 1);
      assert.equal((await db.query("select * from public.slug_redirects where product_id=$1", [id])).rows.length, 0);
    });
  });
  await t.test("Phase 2 requires ready images and alt text before publishing", async () => {
    const blank = (await db.query(`insert into public.media_assets(cloudinary_asset_id,public_id,secure_url,width,height,format,status)
      values ('blank-asset','blank','https://res.cloudinary.com/example/image/upload/blank.jpg',80,80,'jpg','ready') returning id`)).rows[0].id;
    const pending = (await db.query("insert into public.products(category_id,name,slug,description) values ($1,'Pending','pending-phase2','Description') returning id", [category])).rows[0].id;
    await as("authenticated", ids.staff, async () => {
      await rejects("update public.products set status='published' where id=$1", [pending], "23514");
      await rejects("insert into public.product_images(product_id,asset_id,is_primary) values ($1,$2,false)", [pending, blank], "23514");
      await db.query("insert into public.product_images(product_id,asset_id,is_primary) values ($1,$2,true)", [pending, blank]);
      await rejects("update public.products set status='published' where id=$1", [pending], "23514");
      await rejects("select public.claim_unused_media($1)", [asset], "23503");
    });
    await db.query("update public.media_assets set alt='A chair' where id=$1", [blank]);
    await as("authenticated", ids.staff, async () => {
      await db.query("update public.products set status='published' where id=$1", [pending]);
      await rejects("delete from public.product_images where product_id=$1", [pending], "23514");
    });
    await rejects("update public.media_assets set alt='' where id=$1", [blank], "23514");
    await db.query("update public.products set status='draft' where id=$1", [pending]);
    await as("authenticated", ids.staff, async () => {
      await db.query("delete from public.product_images where product_id=$1", [pending]);
      assert.equal((await db.query("select public.claim_unused_media($1) as claimed", [blank])).rows[0].claimed, true);
      await rejects("insert into public.product_images(product_id,asset_id,is_primary) values ($1,$2,true)", [pending, blank], "23514");
    });
    assert.equal((await db.query("select status from public.media_assets where id=$1", [blank])).rows[0].status, "deleting");
    await as("authenticated", ids.staff, async () => await rejects("select public.claim_unused_media($1)", [blank], "PT409"));
    await db.exec("alter table public.media_assets disable trigger touch_updated_at");
    await db.query("update public.media_assets set updated_at=statement_timestamp()-interval '6 minutes' where id=$1", [blank]);
    await db.exec("alter table public.media_assets enable trigger touch_updated_at");
    await as("authenticated", ids.staff, async () => assert.equal((await db.query("select public.claim_unused_media($1) as claimed", [blank])).rows[0].claimed, true));
    await as("authenticated", ids.outsider, async () => await rejects("select public.claim_unused_media($1)", [blank], "42501"));
  });
});
