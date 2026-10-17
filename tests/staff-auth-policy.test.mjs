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
  await db.query("insert into public.admin_profiles(user_id,display_name,role,invite_email,invited_at) values ($1,'Invited','staff','new@example.com',now())", [ids.other]);
  assert.equal((await db.query("select invite_email from public.admin_profiles where user_id=$1", [ids.other])).rows[0].invite_email, "new@example.com");
  await assert.rejects(db.query("update public.admin_profiles set invite_email='new@example.com' where user_id=$1", [ids.editor]), /duplicate key/);
  await assert.rejects(db.query("update public.admin_profiles set invite_email='NEW@example.com' where user_id=$1", [ids.editor]), /admin_profiles_invite_email_valid/);
});

test("invite validation accepts supported roles and rejects malformed addresses", () => {
  const { staffRole, assignableStaffRole, parseStaffInvitation } = loadModule("lib/auth/validation.ts");
  assert.equal(staffRole("owner"), null);
  assert.equal(assignableStaffRole("super_admin", "admin"), null);
  assert.equal(assignableStaffRole("super_admin", "super_admin"), "super_admin");
  for (const role of ["admin", "editor", "staff"]) {
    assert.deepEqual(parseStaffInvitation({ email: "  First.Last+team@sub.example.com  ", display_name: "  New Person  ", role }),
      { email: "first.last+team@sub.example.com", display_name: "New Person", role });
  }
  for (const email of ["a..b@example.com", "a@-example.com", "a@example..com", "a@example", "a b@example.com", "a@example.c"]) {
    assert.equal(parseStaffInvitation({ email, display_name: "New Person", role: "staff" }), null, email);
  }
  assert.equal(parseStaffInvitation({ email: "a@example.com", display_name: "New Person", role: "super_admin" }), null);
  assert.equal(parseStaffInvitation({ email: "a@example.com", display_name: " ", role: "staff" }), null);
});

test("super admin invite action rejects other roles and invalid fields before Auth", async () => {
  let managerRole = "admin", invites = 0;
  const actions = loadModule("lib/auth/actions.ts", {
    "./admin": {
      requireAdmin: async () => ({ user: { id: ids.owner }, session: { role: managerRole } }),
      inviteStaffMember: async () => { invites++; return "sent"; },
    },
    "./mutation": { allowAuthMutation: async () => true },
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: () => {} },
    "@/lib/supabase/server": { createClient: async () => ({}) },
  });
  const old = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = "https://aven.test";
  try {
    const form = new FormData();
    form.set("display_name", "New Staff"); form.set("email", "staff@example.com"); form.set("role", "staff");
    assert.match((await actions.inviteStaffAction(form)).error, /Only a super admin/);
    assert.equal(invites, 0);
    managerRole = "super_admin";
    form.set("role", "consultant");
    assert.ok((await actions.inviteStaffAction(form)).error);
    form.set("role", "staff"); form.set("email", "staff..bad@example.com");
    assert.ok((await actions.inviteStaffAction(form)).error);
    assert.equal(invites, 0);
    form.set("email", "staff@example.com");
    assert.equal((await actions.inviteStaffAction(form)).message, "Invitation sent.");
    assert.equal(invites, 1);
  } finally { if (old === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = old; }
});

test("invite reconciles a pending Auth account and profile without duplicates", async () => {
  const users = [];
  const profiles = new Map();
  let invites = 0, recoveries = 0, inserts = 0, failInsert = false;
  const service = {
    auth: {
      admin: {
        listUsers: async () => ({ data: { users }, error: null }),
        inviteUserByEmail: async (email) => {
          invites++;
          if (users.length) return { data: { user: null }, error: { code: "email_exists", message: "User already registered" } };
          const user = { id: ids.other, email, email_confirmed_at: null };
          users.push(user);
          return { data: { user }, error: null };
        },
      },
      resetPasswordForEmail: async () => { recoveries++; return { error: null }; },
    },
    from: () => ({
      select: () => ({ eq: (_field, id) => ({ maybeSingle: async () => ({ data: profiles.get(id) ?? null, error: null }) }) }),
      insert: async (profile) => {
        inserts++;
        if (failInsert) { failInsert = false; return { error: { code: "temporary" } }; }
        if (profiles.has(profile.user_id)) return { error: { code: "23505" } };
        profiles.set(profile.user_id, profile);
        return { error: null };
      },
      update(values) {
        let id, active;
        return {
          eq(field, value) { if (field === "user_id") id = value; if (field === "active") active = value; return this; },
          select() { return this; },
          async maybeSingle() {
            const profile = profiles.get(id);
            if (!profile || profile.active !== active) return { data: null, error: null };
            Object.assign(profile, values);
            return { data: { user_id: id }, error: null };
          },
        };
      },
    }),
  };
  const { inviteStaffMember, teamInviteStatuses } = loadModule("lib/auth/admin.ts", {
    "server-only": {},
    "@/lib/supabase/admin": { createServiceClient: () => service },
    "next/navigation": { redirect: () => {} },
    "@/lib/supabase/server": { createClient: async () => ({}) },
    "./session": { AuthUnavailableError: Error, readAdminSessionContext: async () => null, sessionErrorKind: () => "invalid" },
  });
  const request = { display_name: "New Staff", email: "staff@example.com", role: "staff" };
  assert.equal(await inviteStaffMember(request, "https://aven.test/auth/confirm"), "sent");
  assert.equal(users.length, 1);
  assert.equal(profiles.size, 1);
  assert.equal(inserts, 1);
  assert.equal(profiles.get(ids.other).invite_email, request.email);
  assert.ok(profiles.get(ids.other).invited_at);
  assert.deepEqual(await teamInviteStatuses([ids.other]), { [ids.other]: { status: "pending", email: request.email } });
  assert.equal(await inviteStaffMember({ ...request, role: "admin" }, "https://aven.test/auth/confirm"), "resent");
  assert.equal(profiles.get(ids.other).role, "admin");
  assert.equal(profiles.get(ids.other).invite_email, request.email);
  assert.equal(profiles.size, 1);
  assert.equal(recoveries, 1);
  profiles.delete(ids.other);
  failInsert = true;
  await assert.rejects(inviteStaffMember(request, "https://aven.test/auth/confirm"), /could not be provisioned/);
  assert.equal(profiles.size, 0);
  assert.equal(await inviteStaffMember(request, "https://aven.test/auth/confirm"), "resent");
  assert.equal(profiles.size, 1);
  assert.equal(inserts, 3);
  assert.equal(recoveries, 3);
  users[0].email_confirmed_at = "2026-10-17T00:00:00Z";
  assert.equal(await inviteStaffMember(request, "https://aven.test/auth/confirm"), "already_active");
  assert.equal(profiles.get(ids.other).role, "staff");
  assert.deepEqual(await teamInviteStatuses([ids.other]), { [ids.other]: { status: "active", email: request.email } });
  profiles.get(ids.other).active = false;
  assert.equal(await inviteStaffMember(request, "https://aven.test/auth/confirm"), "disabled");
  assert.equal(invites, 4);
});

test("invite does not provision an Auth account that appeared after its first lookup", async () => {
  const users = [];
  let profileWrites = 0, recoveryEmails = 0;
  const service = {
    auth: {
      admin: {
        listUsers: async () => ({ data: { users }, error: null }),
        inviteUserByEmail: async (email) => {
          users.push({ id: ids.other, email, email_confirmed_at: null });
          return { data: { user: null }, error: { code: "email_exists" } };
        },
      },
      resetPasswordForEmail: async () => { recoveryEmails++; return { error: null }; },
    },
    from: () => { profileWrites++; throw new Error("profile must not be touched"); },
  };
  const { inviteStaffMember } = loadModule("lib/auth/admin.ts", {
    "server-only": {},
    "@/lib/supabase/admin": { createServiceClient: () => service },
    "next/navigation": { redirect: () => {} },
    "@/lib/supabase/server": { createClient: async () => ({}) },
    "./session": { AuthUnavailableError: Error, readAdminSessionContext: async () => null, sessionErrorKind: () => "invalid" },
  });
  await assert.rejects(inviteStaffMember({ display_name: "New Staff", email: "staff@example.com", role: "staff" }, "https://aven.test/auth/confirm"), /Try again/);
  assert.equal(profileWrites, 0);
  assert.equal(recoveryEmails, 0);
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
