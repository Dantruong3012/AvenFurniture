// Disposable Auth-only fixture. No passwords/tokens/TOTP secrets written to disk.
// Deletes only the UUID created by this run, never an existing user/profile.
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { randomBytes, createHmac } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const ref = "eofdtqnnqgxaoykcbfrv";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
let admin, fixtureId, fixtureClient, stage = "configuration";
let failed = false;
const check = (condition) => { if (!condition) throw new Error("Check failed"); };
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
function result(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? ` (${detail})` : ""}`); if (!ok) failed = true; }
function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.replace(/=+$/, "").toUpperCase()].map((char) => alphabet.indexOf(char).toString(2).padStart(5, "0")).join("");
  const bytes = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", bytes).update(counter).digest();
  return ((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1000000).toString().padStart(6, "0");
}
async function rawRefresh(token) {
  const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST", headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: token }), signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, body: await response.json() };
}
try {
  check(url === `https://${ref}.supabase.co` && key && process.env.SUPABASE_SECRET_KEY);
  admin = createClient(url, process.env.SUPABASE_SECRET_KEY, options);
  const email = `phase0-${randomBytes(12).toString("hex")}@example.com`;
  let password = randomBytes(32).toString("hex");
  stage = "create disposable Auth fixture";
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { phase0_fixture: true } });
  check(!created.error && created.data.user); fixtureId = created.data.user.id;
  fixtureClient = createClient(url, key, options);
  const login = async () => {
    const response = await fixtureClient.auth.signInWithPassword({ email, password });
    check(!response.error && response.data.session); return response.data.session;
  };
  stage = "password login and claims";
  let session = await login();
  const claims = await fixtureClient.auth.getClaims(); check(!claims.error && claims.data?.claims);
  result("email/password login and verified JWT", true);
  const ttl = claims.data.claims.exp - claims.data.claims.iat;
  result("JWT TTL 900 seconds", ttl === 900, `${ttl} seconds observed`);
  stage = "unprovisioned user RLS";
  const context = await fixtureClient.rpc("get_admin_session_context");
  const profiles = await fixtureClient.from("admin_profiles").select("user_id");
  const inquiries = await fixtureClient.from("inquiries").select("id");
  check(!context.error && context.data === null && !profiles.error && profiles.data.length === 0 && !inquiries.error && inquiries.data.length === 0);
  const privateResponse = await fetch(`${url}/rest/v1/admin_guard?select=*`, { headers: { apikey: key, Authorization: `Bearer ${session.access_token}`, "Accept-Profile": "private" } });
  check(privateResponse.status === 406);
  result("no-profile user denied admin data; private schema not exposed", true);

  stage = "refresh reuse via raw HTTP, no SDK cache";
  const root = session.refresh_token;
  const r1 = await rawRefresh(root); check(r1.status === 200 && r1.body.refresh_token !== root);
  // Parent exception is legitimate even outside the normal 10s grace period.
  await delay(11000);
  const parent = await rawRefresh(root); check(parent.status === 200);
  result("parent refresh token exception outside 10s tolerance", true);
  const concurrent = await Promise.all([rawRefresh(parent.body.refresh_token), rawRefresh(parent.body.refresh_token)]);
  check(concurrent.every((response) => response.status === 200));
  result("raw concurrent refresh within grace interval", true);
  await delay(11000);
  const r2 = await rawRefresh(concurrent[0].body.refresh_token); check(r2.status === 200);
  await delay(11000);
  const replay = await rawRefresh(root);
  result("old ancestor replay rejected", replay.status === 400 && replay.body.error_code === "refresh_token_already_used");
  // Revocation can update a legacy token timestamp; test beyond the
  // configured grace interval, not while the reuse exception still applies.
  await delay(11000);
  const afterReplay = await rawRefresh(r2.body.refresh_token);
  result("refresh family invalidated after replay (raw HTTP)", afterReplay.status !== 200, `HTTP ${afterReplay.status}`);

  stage = "SDK automatic refresh with controlled local expiry";
  session = await login();
  const storage = new Map();
  const storageKey = "phase0-memory-only";
  storage.set(storageKey, JSON.stringify({ ...session, expires_at: Math.floor(Date.now() / 1000) - 1 }));
  const auto = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storageKey,
    storage: { getItem: (name) => storage.get(name) ?? null, setItem: (name, value) => storage.set(name, value), removeItem: (name) => storage.delete(name) },
  } });
  const automatic = await auto.auth.getSession();
  check(!automatic.error && automatic.data.session && automatic.data.session.expires_at > Date.now() / 1000);
  result("SDK refreshes session with controlled expired expires_at", true);
  await auto.auth.signOut({ scope: "local" }); storage.clear();

  stage = "MFA enroll/challenge/verify/AAL2";
  await login();
  const enrolled = await fixtureClient.auth.mfa.enroll({ factorType: "totp", friendlyName: "Disposable test factor" });
  check(!enrolled.error && enrolled.data);
  const verified = await fixtureClient.auth.mfa.challengeAndVerify({ factorId: enrolled.data.id, code: totp(enrolled.data.totp.secret) });
  check(!verified.error);
  const assurance = await fixtureClient.auth.getClaims(); check(assurance.data?.claims.aal === "aal2");
  result("TOTP enrollment/challenge/verify and signed AAL2", true);
  check(!(await fixtureClient.auth.mfa.unenroll({ factorId: enrolled.data.id })).error);
  result("AAL2 factor removal", true);

  stage = "password change and global signout on fixture only";
  await login();
  const nextPassword = randomBytes(32).toString("hex");
  check(!(await fixtureClient.auth.updateUser({ password: nextPassword })).error);
  check(!(await fixtureClient.auth.signOut({ scope: "global" })).error);
  const oldLogin = await fixtureClient.auth.signInWithPassword({ email, password }); check(Boolean(oldLogin.error));
  password = nextPassword; await login();
  result("password changed; old password rejected; new password accepted", true);

  stage = "recovery proof without SMTP (Admin generated link)";
  const link = await admin.auth.admin.generateLink({ type: "recovery", email });
  check(!link.error && link.data.properties.hashed_token);
  const recovery = await fixtureClient.auth.verifyOtp({ type: "recovery", token_hash: link.data.properties.hashed_token });
  check(!recovery.error && recovery.data.user?.id === fixtureId);
  const again = await fixtureClient.auth.verifyOtp({ type: "recovery", token_hash: link.data.properties.hashed_token });
  check(Boolean(again.error));
  result("recovery proof single-use; no email sent; delivery NOT TESTED", true);

  stage = "staff session RPC and SSR reload via authorized admin-generated link";
  const staffEmail = "staff-test-eofdtqnnqgxaoykcbfrv@example.com";
  const staffLink = await admin.auth.admin.generateLink({ type: "magiclink", email: staffEmail });
  check(!staffLink.error);
  const cookieJar = new Map();
  const ssr = () => createServerClient(url, key, { cookies: { getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })), setAll: (values) => values.forEach(({ name, value }) => value ? cookieJar.set(name, value) : cookieJar.delete(name)) } });
  const staff = ssr();
  try {
    const staffProof = await staff.auth.verifyOtp({ type: "magiclink", token_hash: staffLink.data.properties.hashed_token });
    check(!staffProof.error && staffProof.data.user);
    const existing = await admin.from("admin_profiles").select("user_id,role,active").eq("user_id", staffProof.data.user.id).single();
    check(!existing.error && existing.data.role === "staff" && existing.data.active);
    const reloaded = ssr();
    const user = await reloaded.auth.getUser(); check(user.data.user?.id === existing.data.user_id);
    const live = await reloaded.rpc("get_admin_session_context"); check(!live.error && live.data?.role === "staff");
    check(Math.abs(Date.parse(live.data.expires_at) - Date.now() - 604800000) < 60000);
    const current = await staff.auth.getSession();
    check(!(await staff.auth.refreshSession()).error);
    check((await staff.rpc("get_admin_session_context")).data.expires_at === live.data.expires_at);
    check(!(await staff.auth.signOut({ scope: "local" })).error);
    const old = await fetch(`${url}/rest/v1/rpc/get_admin_session_context`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${current.data.session.access_token}`, "Content-Type": "application/json" }, body: "{}" });
    check(old.ok && await old.json() === null);
    result("staff SSR reload, fixed 7-day deadline, logout invalidates JWT authorization", true);
  } finally { await staff.auth.signOut({ scope: "local" }); cookieJar.clear(); }
} catch {
  console.error(`FAIL: ${stage}. Credential/error payloads suppressed.`); failed = true;
} finally {
  if (fixtureClient) { try { await fixtureClient.auth.signOut({ scope: "global" }); } catch { /* suppressed */ } }
  if (fixtureId && admin) {
    const deleted = await admin.auth.admin.deleteUser(fixtureId);
    result("disposable Auth fixture removed", !deleted.error);
  }
}
if (failed) process.exitCode = 1;
