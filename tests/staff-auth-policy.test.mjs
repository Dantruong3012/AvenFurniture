import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { loadModule } from "./helpers/load-module.mjs";

const ids = {
  owner: "20000000-0000-0000-0000-000000000001",
  manager: "20000000-0000-0000-0000-000000000002",
  editor: "20000000-0000-0000-0000-000000000003",
  other: "20000000-0000-0000-0000-000000000004",
};
const sessionId = (id) => id.replace("20000000-", "30000000-");

test("staff role RLS, lockout and session revocation in isolated PostgreSQL", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users(id uuid primary key, email text);
    create table auth.sessions(id uuid primary key, user_id uuid not null references auth.users(id), created_at timestamptz not null default now(), not_after timestamptz);
    create table auth.refresh_tokens(session_id uuid);
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);
  for (const file of (await readdir(new URL("../supabase/migrations/", import.meta.url))).filter((name) => name.endsWith(".sql")).sort()) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
  }
  for (const [role, id] of Object.entries(ids)) {
    await db.query("insert into auth.users values ($1,$2)", [id, `${role}@example.com`]);
    await db.query("insert into auth.sessions(id,user_id) values ($1,$2)", [sessionId(id), id]);
  }
  await db.query(`insert into public.admin_profiles(user_id,display_name,role) values
    ($1,'Owner','super_admin'),($2,'Manager','admin'),($3,'Editor','editor')`, [ids.owner, ids.manager, ids.editor]);
  async function as(id, run) {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: id, session_id: sessionId(id) })]);
    await db.exec("set role authenticated");
    try { return await run(); } finally {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub','',false)");
      await db.query("select set_config('request.jwt.claims','{}',false)");
    }
  }
  const context = async () => (await db.query("select public.get_admin_session_context() as value")).rows[0].value;
  assert.equal((await as(ids.manager, context)).role, "admin");
  assert.equal((await as(ids.editor, context)).role, "editor");
  assert.equal(await as(ids.other, context), null);
  assert.deepEqual((await as(ids.manager, () => db.query("select role from public.admin_profiles order by role"))).rows.map((row) => row.role), ["admin", "editor"]);
  assert.deepEqual((await as(ids.editor, () => db.query("select role from public.admin_profiles"))).rows.map((row) => row.role), ["editor"]);
  assert.equal((await as(ids.manager, () => db.query("update public.admin_profiles set role='super_admin' where user_id=$1 returning user_id", [ids.manager]))).rows.length, 0);
  assert.equal((await as(ids.manager, () => db.query("insert into public.categories(name,slug) values ('Office','office') returning id"))).rows.length, 1);
  await assert.rejects(as(ids.editor, () => db.query("insert into public.categories(name,slug) values ('Forbidden','forbidden')")), /row-level security/);
  await assert.rejects(db.query("update public.admin_profiles set active=false where user_id=$1", [ids.owner]), /last active super_admin/);
  await assert.rejects(db.query("update public.admin_profiles set role='editor' where user_id=$1", [ids.owner]), /last active super_admin/);
  await assert.rejects(db.query("delete from public.admin_profiles where user_id=$1", [ids.owner]), /last active super_admin/);
  await db.query("insert into auth.refresh_tokens(session_id) values ($1)", [sessionId(ids.editor)]);
  await db.query("update public.admin_profiles set active=false where user_id=$1", [ids.editor]);
  assert.equal(await as(ids.editor, context), null);
  assert.equal((await db.query("select not_after <= now() as expired from auth.sessions where user_id=$1", [ids.editor])).rows[0].expired, true);
  assert.equal((await db.query("select count(*)::int as count from auth.refresh_tokens where session_id=$1", [sessionId(ids.editor)])).rows[0].count, 0);
  await db.query("update public.admin_profiles set active=true where user_id=$1", [ids.editor]);
  assert.equal(await as(ids.editor, context), null);
  await db.query("update public.admin_profiles set role='super_admin' where user_id=$1", [ids.manager]);
  await db.query("update public.admin_profiles set role='editor' where user_id=$1", [ids.owner]);
  assert.equal((await db.query("select active_count from private.admin_guard")).rows[0].active_count, 1);
});

test("invite validates roles before Auth call and provisions only an authorized invite", async () => {
  const { staffRole, assignableStaffRole } = loadModule("lib/auth/validation.ts");
  assert.equal(staffRole("owner"), null);
  assert.equal(assignableStaffRole("super_admin", "admin"), null);
  assert.equal(assignableStaffRole("super_admin", "super_admin"), "super_admin");
  let invites = 0, inserts = 0;
  const service = {
    auth: { admin: { inviteUserByEmail: async () => { invites++; return { data: { user: { id: ids.other } }, error: null }; } } },
    from: () => ({ insert: async () => { inserts++; return { error: null }; } }),
  };
  const actions = loadModule("lib/auth/actions.ts", {
    "@/lib/auth/admin": { requireStaffManager: async () => ({ user: { id: ids.manager }, session: { role: "admin" } }) },
    "./admin": { requireStaffManager: async () => ({ user: { id: ids.manager }, session: { role: "admin" } }) },
    "@/lib/supabase/admin": { createServiceClient: () => service },
    "./mutation": { allowAuthMutation: async () => true },
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: () => {} },
    "@/lib/supabase/server": { createClient: async () => ({}) },
  });
  const old = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = "https://aven.test";
  try {
    const form = new FormData();
    form.set("display_name", "New Editor"); form.set("email", "editor@example.com"); form.set("role", "super_admin");
    assert.ok((await actions.inviteStaff(form)).error);
    assert.equal(invites, 0);
    form.set("role", "editor");
    assert.equal((await actions.inviteStaff(form)).message, "Invitation sent.");
    assert.equal(invites, 1); assert.equal(inserts, 1);
  } finally { if (old === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = old; }
});

test("management actions reject super admin escalation and revoke access before Auth deletion", async () => {
  let managerRole = "admin", targetRole = "super_admin", targetActive = true;
  let authDeleted = false;
  const calls = [];
  const service = {
    auth: { admin: {
      getUserById: async () => ({ data: { user: { deleted_at: authDeleted ? "2026-10-17T00:00:00Z" : undefined } }, error: null }),
      updateUserById: async (_id, values) => { calls.push(`auth:${values.ban_duration}`); return { error: null }; },
      deleteUser: async (_id, soft) => { calls.push(`delete:${soft}`); return { error: null }; },
    } },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { user_id: ids.editor, role: targetRole, active: targetActive }, error: null }) }) }),
      update: (values) => ({
        eq() { return this; }, select() { return this; },
        async maybeSingle() { calls.push(`profile:${JSON.stringify(values)}`); targetActive = values.active ?? targetActive; return { data: { user_id: ids.editor }, error: null }; },
      }),
    }),
  };
  const actions = loadModule("lib/auth/actions.ts", {
    "./admin": { requireStaffManager: async () => ({ user: { id: ids.manager }, session: { role: managerRole } }) },
    "@/lib/supabase/admin": { createServiceClient: () => service },
    "./mutation": { allowAuthMutation: async () => true },
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: () => {} },
    "@/lib/supabase/server": { createClient: async () => ({}) },
  });
  const form = new FormData(); form.set("user_id", ids.editor); form.set("role", "super_admin");
  assert.ok((await actions.changeStaffRole(form)).error);
  form.set("role", "editor");
  assert.ok((await actions.changeStaffRole(form)).error);
  assert.deepEqual(calls, []);
  targetRole = "editor";
  form.set("active", "false");
  assert.ok((await actions.setStaffActive(form)).message);
  assert.deepEqual(calls, ['profile:{"active":false}', "auth:876000h"]);
  calls.length = 0;
  assert.ok((await actions.setStaffActive(form)).message);
  assert.deepEqual(calls, ["auth:876000h"]);
  calls.length = 0; form.set("active", "true");
  assert.ok((await actions.setStaffActive(form)).message);
  assert.deepEqual(calls, ['profile:{"active":true}', "auth:none"]);
  calls.length = 0; authDeleted = true; targetActive = false;
  assert.ok((await actions.setStaffActive(form)).error);
  assert.deepEqual(calls, []);
  authDeleted = false;
  calls.length = 0; targetActive = true;
  form.set("confirm", "DELETE");
  assert.ok((await actions.deleteStaff(form)).message);
  assert.deepEqual(calls, ['profile:{"active":false}', "delete:true"]);
});
