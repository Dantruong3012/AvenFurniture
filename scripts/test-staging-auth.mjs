// Explicit development integration test. Creates/signs out sessions for ONE
// disposable, pre-provisioned staff account. Never creates users/sends email.
// Usage: node --env-file=.env.staging.local scripts/test-staging-auth.mjs
import { createClient } from "@supabase/supabase-js";
import { setTimeout as delay } from "node:timers/promises";

const env = process.env;
const approvedDevelopmentRef = "eofdtqnnqgxaoykcbfrv";
const cleanup = new Set();
const check = (condition, label) => { if (!condition) throw new Error(label); };
let currentCheck = "staging configuration";

try {
  const url = new URL(env.STAGING_SUPABASE_URL ?? "");
  const ref = url.hostname.split(".")[0];
  check(url.protocol === "https:" && url.hostname === `${ref}.supabase.co`, "Invalid staging URL");
  check(ref === approvedDevelopmentRef, "Only the explicitly approved MVP project is allowed");
  check(ref === env.STAGING_PROJECT_REF, "Staging project ref mismatch");
  const key = env.STAGING_SUPABASE_PUBLISHABLE_KEY;
  check(key?.startsWith("sb_publishable_"), "Missing staging publishable key");
  check(env.STAGING_STAFF_EMAIL && env.STAGING_STAFF_PASSWORD, "Missing disposable staging staff credentials");
  const client = () => createClient(url.origin, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  async function login() {
    const c = client();
    cleanup.add(c);
    const { data, error } = await c.auth.signInWithPassword({ email: env.STAGING_STAFF_EMAIL, password: env.STAGING_STAFF_PASSWORD });
    check(!error && data.session, "Staging login failed");
    return { c, session: data.session };
  }
  async function rpc(c) {
    const { data, error } = await c.rpc("get_admin_session_context");
    check(!error, "Session RPC unavailable");
    return data;
  }
  async function raw(path, token, method = "GET", body) {
    return fetch(new URL(path, url), {
      method, headers: { apikey: key, ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
  }
  currentCheck = "JWT lifetime and private session RPC";
  const first = await login();
  const claims = await first.c.auth.getClaims(first.session.access_token);
  check(!claims.error && claims.data?.claims, "JWT verification failed");
  const jwtLifetime = claims.data.claims.exp - claims.data.claims.iat;
  if (jwtLifetime !== 900) {
    console.error(`FAIL: JWT lifetime is ${jwtLifetime} seconds; expected 900. Continuing independent checks.`);
    process.exitCode = 1;
  }
  currentCheck = "private session RPC";
  const initial = await rpc(first.c);
  check(initial?.role === "staff", "Use a disposable staff account, not super_admin");
  check(Object.keys(initial).sort().join(",") === "expires_at,role", "Unexpected private fields in session RPC");
  check(Math.abs(Date.parse(initial.expires_at) - Date.now() - 604800000) < 60000, "New session must expire in seven days");
  console.log("PASS: verified JWT and seven-day session context");

  currentCheck = "direct PostgREST access controls";
  const anon = await raw("/rest/v1/inquiries?select=id");
  check(!anon.ok, "Anonymous inquiry access must be denied");
  const forged = await raw("/rest/v1/inquiries?select=id", "invalid.jwt.signature");
  check(forged.status === 401, "Malformed JWT must be rejected");
  const privilege = await raw("/rest/v1/categories", first.session.access_token, "POST", { name: "Forbidden staging category", slug: `forbidden-${Date.now()}` });
  check(!privilege.ok, "Staff category INSERT must be denied");
  console.log("PASS: direct API anonymous/JWT/staff permission checks");

  currentCheck = "refresh rotation preserves fixed expiry";
  const oldRefresh = first.session.refresh_token;
  const refreshed = await first.c.auth.refreshSession({ refresh_token: oldRefresh });
  check(!refreshed.error && refreshed.data.session, "Refresh failed");
  check(refreshed.data.session.refresh_token !== oldRefresh, "Refresh token did not rotate");
  check((await rpc(first.c)).expires_at === initial.expires_at, "Refresh extended absolute session deadline");
  const refreshedClaims = await first.c.auth.getClaims(refreshed.data.session.access_token);
  check(refreshedClaims.data?.claims.session_id === claims.data.claims.session_id, "Refresh changed session identity");
  console.log("PASS: refresh rotation keeps original session/deadline");

  currentCheck = "concurrent SSR/browser refresh within reuse interval";
  const concurrent = await login();
  const a = client(), b = client(); cleanup.add(a); cleanup.add(b);
  const results = await Promise.all([a.auth.refreshSession({ refresh_token: concurrent.session.refresh_token }), b.auth.refreshSession({ refresh_token: concurrent.session.refresh_token })]);
  check(results.every((r) => !r.error && r.data.session), "Concurrent refresh rejected within reuse interval");
  console.log("PASS: two clients can refresh concurrently within reuse tolerance");

  currentCheck = "logout invalidates old JWT access while preserving other devices";
  const heldJWT = refreshed.data.session.access_token;
  check(!(await first.c.auth.signOut({ scope: "local" })).error, "Local sign-out failed");
  const loggedOut = await raw("/rest/v1/rpc/get_admin_session_context", heldJWT, "POST", {});
  check(loggedOut.ok && await loggedOut.json() === null, "Old JWT retained admin access after logout");
  check((await rpc(a))?.role === "staff", "Local sign-out revoked another device");
  console.log("PASS: logged-out JWT denied; other device remains active");

  currentCheck = "replay outside reuse tolerance and parent exception";
  const replay = await login();
  const rootRefresh = replay.session.refresh_token;
  const r1 = await replay.c.auth.refreshSession({ refresh_token: rootRefresh });
  check(!r1.error && r1.data.session, "First rotation failed");
  // Wait beyond reuse tolerance so Auth issues a distinct descendant.
  await delay(11000);
  const r2 = await replay.c.auth.refreshSession({ refresh_token: r1.data.session.refresh_token });
  check(!r2.error && r2.data.session, "Second rotation failed");
  check(r2.data.session.refresh_token !== r1.data.session.refresh_token, "Second rotation must produce a distinct descendant");
  await delay(11000);
  currentCheck = "old grandparent token rejection";
  const attacker = client(); cleanup.add(attacker);
  const reused = await attacker.auth.refreshSession({ refresh_token: rootRefresh });
  console.log(JSON.stringify({ check: "grandparent_replay", rejected: Boolean(reused.error), status: reused.error?.status, code: reused.error?.code }));
  check(reused.error?.code === "refresh_token_already_used", "Expected explicit token reuse rejection");
  currentCheck = "replayed token family revocation outside grace";
  await delay(11000);
  const revoked = await replay.c.auth.refreshSession({ refresh_token: r2.data.session.refresh_token });
  console.log(JSON.stringify({ check: "family_after_replay", rejected: Boolean(revoked.error), status: revoked.error?.status, code: revoked.error?.code }));
  check(Boolean(revoked.error), "Replay did not revoke token family");
  console.log("PASS: refresh token reuse detection");
  console.log("Remaining staging cases: signed JWT expiry, fixed-day boundary, account lock/demotion and password reset require the documented controlled fixtures/email flow.");
} catch {
  // Never print SDK exceptions or assertion payloads containing credentials.
  console.error(`FAIL: ${currentCheck}. No credentials or tokens were logged.`);
  process.exitCode = 1;
} finally {
  for (const c of cleanup) {
    try { await c.auth.signOut({ scope: "local" }); } catch { /* no token logging */ }
  }
}
