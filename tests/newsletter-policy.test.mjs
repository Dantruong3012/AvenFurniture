import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { loadModule } from "./helpers/load-module.mjs";

const policy = loadModule("lib/newsletter/policy.ts");
const adminId = "00000000-0000-0000-0000-000000000001";
const outsiderId = "00000000-0000-0000-0000-000000000002";

test("consent requires an explicit opt-in and normalizes email", () => {
  assert.equal(policy.parseNewsletterConsent({ email: " USER@Example.com ", accepted: "on" }).email, "user@example.com");
  for (const input of [
    { email: "user@example.com", accepted: null },
    { email: "user@example.com", accepted: "false" },
    { email: "no address", accepted: "on" },
    { email: "a".repeat(255) + "@example.com", accepted: "on" },
  ]) assert.equal(policy.parseNewsletterConsent(input), null);
});

test("unsubscribe tokens are random, strictly validated and hashed before storage", () => {
  const first = policy.generateUnsubscribeToken();
  const second = policy.generateUnsubscribeToken();
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(first, second);
  assert.deepEqual(policy.verifyUnsubscribeToken(first), { valid: true, token: first });
  for (const bad of [null, "", "a".repeat(63), "A".repeat(64), "a".repeat(64) + "x"]) {
    assert.deepEqual(policy.verifyUnsubscribeToken(bad), { valid: false });
  }
  assert.notEqual(policy.hashUnsubscribeToken(first), first);
  assert.equal(policy.hashUnsubscribeToken(first), policy.hashUnsubscribeToken(first));
  assert.throws(() => policy.hashUnsubscribeToken("bad"));
});

test("consent metadata never retains raw IP or user agent and does not correlate across records", () => {
  const first = policy.consentMetadataHashes("192.0.2.1, 10.0.0.1", "Example Browser");
  const second = policy.consentMetadataHashes("192.0.2.1", "Example Browser");
  assert.match(first.ipHash, /^[0-9a-f]{64}$/);
  assert.match(first.userAgentHash, /^[0-9a-f]{64}$/);
  assert.notEqual(first.ipHash, second.ipHash);
  assert.notEqual(first.userAgentHash, second.userAgentHash);
  assert.deepEqual(policy.consentMetadataHashes("not-an-ip", "x".repeat(1025)), { ipHash: null, userAgentHash: null });
});

test("public actions enforce consent and token shape, hide roster state and sanitize RPC errors", async () => {
  const calls = [];
  let denied = false;
  let failure = false;
  const actions = loadModule("lib/newsletter/actions.ts", {
    "next/headers": { headers: async () => new Headers({ "x-forwarded-for": "192.0.2.8", "user-agent": "Example Browser" }) },
    "@/lib/auth/mutation": { allowAuthMutation: async () => !denied },
    "@/lib/supabase/admin": { createServiceClient: () => ({ rpc: async (...args) => {
      calls.push(args);
      return { error: failure ? new Error("private database detail") : null };
    } }) },
  });
  const subscribeForm = new FormData();
  subscribeForm.set("email", " Reader@Example.com ");
  assert.match((await actions.subscribeNewsletter({}, subscribeForm)).error, /agree/);
  assert.equal(calls.length, 0);
  subscribeForm.set("consent", "on");
  denied = true;
  assert.match((await actions.subscribeNewsletter({}, subscribeForm)).error, /wait/);
  assert.equal(calls.length, 0);
  denied = false;
  const response = await actions.subscribeNewsletter({}, subscribeForm);
  assert.ok(response.success);
  assert.doesNotMatch(JSON.stringify(response), /[0-9a-f]{64}/);
  assert.equal(calls[0][0], "subscribe_newsletter");
  assert.equal(calls[0][1].p_email, "reader@example.com");
  assert.match(calls[0][1].p_token_digest, /^[0-9a-f]{64}$/);
  assert.match(calls[0][1].p_ip_hash, /^[0-9a-f]{64}$/);
  failure = true;
  assert.doesNotMatch((await actions.subscribeNewsletter({}, subscribeForm)).error, /private database detail/);
  const unsubscribeForm = new FormData();
  unsubscribeForm.set("token", "bad");
  assert.match((await actions.unsubscribeNewsletter({}, unsubscribeForm)).error, /invalid/);
  const token = policy.generateUnsubscribeToken();
  unsubscribeForm.set("token", token);
  failure = false;
  assert.ok((await actions.unsubscribeNewsletter({}, unsubscribeForm)).success);
  assert.deepEqual(calls.at(-1), ["unsubscribe_newsletter", { p_token: token }]);
});

test("migration enforces roster privacy, token-only unsubscribe and retention in isolated PostgreSQL", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema private;
    create table private.staff (id uuid primary key, active boolean not null);
    insert into private.staff values ('${adminId}', true), ('${outsiderId}', false);
    create function private.current_admin_role() returns text language sql stable security definer set search_path = '' as
      $$ select 'staff'::text from private.staff where id = nullif(current_setting('request.jwt.claim.sub', true), '')::uuid and active $$;
    create function private.touch_updated_at() returns trigger language plpgsql as
      $$ begin new.updated_at := now(); return new; end $$;
    grant usage on schema private to authenticated;
    grant execute on function private.current_admin_role() to authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
  const migration = await readFile(new URL("../supabase/migrations/20261017180000_newsletter_data_policy.sql", import.meta.url), "utf8");
  await db.exec(migration);
  const token = policy.generateUnsubscribeToken();
  const digest = policy.hashUnsubscribeToken(token);
  async function as(role, id, fn) {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? ""]);
    await db.exec(`set role ${role}`);
    try { return await fn(); } finally {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub', '', false)");
    }
  }

  await t.test("new consent persists as active; duplicate cannot reverse an opt-out", async () => {
    await as("service_role", null, () => db.query("select public.subscribe_newsletter($1,$2,$3,$4,$5,$6)",
      ["reader@example.com", "newsletter_form", "2026-10", digest, null, null]));
    const { rows } = await db.query("select * from public.newsletter_subscribers");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "active");
    assert.equal(rows[0].unsubscribe_token, digest);
    assert.ok(rows[0].consent_timestamp);
    assert.equal(rows[0].consent_source, "newsletter_form");
    assert.equal(rows[0].consent_version, "2026-10");
    await assert.rejects(as("service_role", null, () => db.query("select public.subscribe_newsletter($1,$2,$3,$4,$5,$6)",
      ["other@example.com", "newsletter_form", "2026-10", "raw-token", null, null])), { code: "22023" });
    await assert.rejects(as("anon", null, () => db.query("select public.subscribe_newsletter($1,$2,$3,$4,$5,$6)",
      ["attacker@example.com", "newsletter_form", "2026-10", digest, null, null])), { code: "42501" });
  });

  await t.test("anonymous and ordinary users cannot select, insert or update subscriber rows", async () => {
    for (const [role, id] of [["anon", null], ["authenticated", outsiderId]]) {
      if (role === "anon") {
        await assert.rejects(as(role, id, () => db.query("select * from public.newsletter_subscribers")), { code: "42501" });
      } else {
        assert.deepEqual((await as(role, id, () => db.query("select * from public.newsletter_subscribers"))).rows, []);
      }
      await assert.rejects(as(role, id, () => db.query("insert into public.newsletter_subscribers(email,unsubscribe_token) values ('other@example.com',$1)", ["a".repeat(64)])), { code: "42501" });
      await assert.rejects(as(role, id, () => db.query("update public.newsletter_subscribers set status='unsubscribed'")), { code: "42501" });
    }
    const staff = await as("authenticated", adminId, () => db.query("select email from public.newsletter_subscribers"));
    assert.deepEqual(staff.rows, [{ email: "reader@example.com" }]);
    await assert.rejects(as("authenticated", adminId, () => db.query("update public.newsletter_subscribers set email='x@example.com'")), { code: "42501" });
  });

  await t.test("only a valid bearer token unsubscribes, without email in the call", async () => {
    assert.equal((await as("anon", null, () => db.query("select public.unsubscribe_newsletter($1) as changed", ["f".repeat(64)]))).rows[0].changed, false);
    assert.equal((await as("anon", null, () => db.query("select public.unsubscribe_newsletter($1) as changed", [digest]))).rows[0].changed, false);
    assert.equal((await as("anon", null, () => db.query("select public.unsubscribe_newsletter($1) as changed", [token]))).rows[0].changed, true);
    assert.equal((await as("anon", null, () => db.query("select public.unsubscribe_newsletter($1) as changed", [token]))).rows[0].changed, false);
    const { rows } = await db.query("select status, unsubscribed_at from public.newsletter_subscribers");
    assert.equal(rows[0].status, "unsubscribed");
    assert.ok(rows[0].unsubscribed_at);
    await as("service_role", null, () => db.query("select public.subscribe_newsletter($1,$2,$3,$4,$5,$6)",
      ["reader@example.com", "newsletter_form", "2026-10", "b".repeat(64), null, null]));
    assert.equal((await db.query("select status from public.newsletter_subscribers")).rows[0].status, "unsubscribed");
  });

  await t.test("cleanup is service-only and removes expired pending/unsubscribed records", async () => {
    await db.query("update public.newsletter_subscribers set unsubscribed_at = now() - interval '91 days'");
    await db.query("insert into public.newsletter_subscribers(email,unsubscribe_token,created_at) values ($1,$2,now() - interval '31 days')", ["pending@example.com", "c".repeat(64)]);
    await db.query("insert into public.newsletter_subscribers(email,status,consent_timestamp,consent_source,consent_version,unsubscribe_token,created_at) values ($1,'active',now() - interval '365 days','newsletter_form','2026-10',$2,now() - interval '365 days')", ["active@example.com", "d".repeat(64)]);
    await assert.rejects(as("anon", null, () => db.query("select public.cleanup_newsletter_retention()")), { code: "42501" });
    const result = await as("service_role", null, () => db.query("select public.cleanup_newsletter_retention() as removed"));
    assert.equal(result.rows[0].removed, 2);
    assert.deepEqual((await db.query("select email from public.newsletter_subscribers")).rows, [{ email: "active@example.com" }]);
  });
});
