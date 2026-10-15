import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";
import { NextRequest } from "next/server.js";
import { AuthRetryableFetchError, AuthInvalidJwtError } from "@supabase/supabase-js";

const root = path.resolve(import.meta.dirname, "..");
const nativeRequire = createRequire(import.meta.url);
// Transpile actual production modules in memory; mock only the remote Supabase
// transport. No network, fixtures on disk, generated source or new test runner.
function loadModule(filename, overrides = {}, cache = new Map()) {
  const absolute = path.resolve(root, filename);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const compiledModule = { exports: {} };
  cache.set(absolute, compiledModule);
  const code = ts.transpileModule(readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const require = (name) => {
    if (name in overrides) return overrides[name];
    if (name.startsWith("@/")) return loadModule(name.slice(2) + ".ts", overrides, cache);
    if (name.startsWith(".")) return loadModule(path.resolve(path.dirname(absolute), name + ".ts"), overrides, cache);
    return nativeRequire(name);
  };
  new Function("require", "module", "exports", code)(require, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

const key = "sb-session-test-auth-token";
const cookie = `${key}.0=old-token; ${key}-code-verifier=pkce; unrelated=keep`;
const context = { role: "staff", expires_at: "2099-01-01T00:00:00.000Z" };
function setup({ claims = { sub: "user-id" }, error = null, rpcData = context, rpcError = null, mutate, thrown } = {}) {
  let rpcCalls = 0;
  let cookieOptions;
  const { proxy } = loadModule("proxy.ts", {
    "@/lib/supabase/config": { getSupabaseConfig: () => ({ url: "https://session-test.supabase.co", publishableKey: "test-public-key" }) },
    "@supabase/ssr": {
      createServerClient(_url, _key, options) {
        cookieOptions = options.cookieOptions;
        return {
          auth: { async getClaims() {
            mutate?.(options.cookies);
            if (thrown) throw thrown;
            return { data: claims ? { claims } : null, error };
          } },
          async rpc(name) {
            assert.equal(name, "get_admin_session_context"); rpcCalls++;
            return { data: rpcData, error: rpcError };
          },
        };
      },
    },
  });
  return { proxy, calls: () => rpcCalls, cookieOptions: () => cookieOptions };
}
const request = (url = "/admin") => new NextRequest(`https://aven.test${url}`, { headers: { cookie } });
function assertPrivate(response) {
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
}

test("missing/invalid sessions redirect pages and clear only this project's session", async () => {
  for (const options of [{ claims: null }, { error: new AuthInvalidJwtError("invalid") }, { rpcData: null }]) {
    const harness = setup(options);
    const response = await harness.proxy(request("/admin?next=https://untrusted.test"));
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "https://aven.test/admin/login");
    assert.equal(response.cookies.get(`${key}.0`).maxAge, 0);
    assert.equal(response.cookies.get(`${key}-code-verifier`), undefined);
    assert.equal(response.cookies.get("unrelated"), undefined);
    assertPrivate(response);
  }
});
test("API session failures return 401 JSON, never login HTML", async () => {
  const response = await setup({ rpcData: null }).proxy(request("/api/admin/products"));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Authentication required." });
  assertPrivate(response);
});
test("expired session blocks even a cryptographically valid JWT; public login remains reachable", async () => {
  const harness = setup({ rpcData: null });
  assert.equal((await harness.proxy(request())).status, 307);
  assert.equal(harness.calls(), 1);
  const publicPage = setup({ claims: null });
  assert.equal((await publicPage.proxy(request("/admin/login"))).status, 200);
  assert.equal(publicPage.calls(), 0);
});
test("network, rate-limit, missing migration and malformed RPC never clear cookies", async () => {
  const warning = mock.method(console, "warn", () => {});
  try {
    for (const options of [
      { error: new AuthRetryableFetchError("offline", 503) },
      { error: { status: 429, code: "over_request_rate_limit" } },
      { rpcError: { code: "PGRST202" } },
      { rpcData: { role: "owner", expires_at: "invalid" } },
      { thrown: new TypeError("fetch failed") },
    ]) {
      const harness = setup({ ...options, mutate: (cookies) => cookies.setAll([{ name: `${key}.0`, value: "", options: { maxAge: 0 } }], {}) });
      const response = await harness.proxy(request());
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("set-cookie"), null);
      assert.equal(response.headers.get("retry-after"), "5");
      assertPrivate(response);
    }
    for (const call of warning.mock.calls) assert.deepEqual(JSON.parse(call.arguments[0]), { event: "auth_unavailable", status: 503 });
  } finally { warning.mock.restore(); }
});
test("successful refresh propagates chunks to request and response with private headers", async () => {
  const harness = setup({ mutate: (cookies) => cookies.setAll([
    { name: `${key}.0`, value: "rotated-a", options: { path: "/", secure: true, sameSite: "lax" } },
    { name: `${key}.1`, value: "rotated-b", options: { path: "/", secure: true, sameSite: "lax" } },
  ], { "Cache-Control": "private, no-store" }) });
  const req = request();
  const response = await harness.proxy(req);
  assert.equal(response.status, 200);
  assert.equal(response.cookies.get(`${key}.0`).value, "rotated-a");
  assert.equal(req.cookies.get(`${key}.1`).value, "rotated-b");
  assert.equal(harness.cookieOptions().sameSite, "lax");
  assert.equal(harness.cookieOptions().httpOnly, undefined);
  assertPrivate(response);
});
test("cookie options enable Secure in production and reject similarly named unrelated cookies", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const { authCookieOptions, isSessionCookie } = loadModule("lib/supabase/cookies.ts");
    assert.equal(authCookieOptions.secure, true);
    assert.equal(isSessionCookie(key, key), true);
    assert.equal(isSessionCookie(`${key}.12`, key), true);
    assert.equal(isSessionCookie(`${key}-code-verifier`, key), false);
    assert.equal(isSessionCookie(`${key}.attacker`, key), false);
    assert.equal(isSessionCookie("sb-other-auth-token.0", key), false);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
  }
});

test("Auth mutations reject missing/cross-site Origin and enforce bounded windows", () => {
  const { sameOrigin, AuthAttemptLimiter } = loadModule("lib/auth/mutation.ts", { "server-only": {}, "next/headers": {} });
  assert.equal(sameOrigin("https://aven.test", "aven.test"), true);
  for (const origin of [null, "null", "https://evil.test", "https://aven.test.evil.test", "https://user@aven.test", "ftp://aven.test"]) {
    assert.equal(sameOrigin(origin, "aven.test"), false);
  }
  assert.equal(sameOrigin("http://localhost:3001", "localhost:3000"), false);
  const limiter = new AuthAttemptLimiter();
  assert.equal(limiter.take("one", 1000, 2, 100), true);
  assert.equal(limiter.take("one", 1001, 2, 100), true);
  assert.equal(limiter.take("one", 1099, 2, 100), false);
  assert.equal(limiter.take("two", 1099, 2, 100), true);
  assert.equal(limiter.take("one", 1100, 2, 100), true);
});

test("sensitive Auth operations require signed AAL2 once any factor is verified", async () => {
  const { sensitiveAuthAllowed } = loadModule("lib/auth/mfa-policy.ts");
  const client = (status, aal, error = null) => ({ auth: {
    mfa: { listFactors: async () => ({ data: { all: [{ status }] }, error }) },
    getClaims: async () => ({ data: { claims: { aal } }, error }),
  } });
  assert.equal(await sensitiveAuthAllowed(client("unverified", "aal1")), true);
  assert.equal(await sensitiveAuthAllowed(client("verified", "aal1")), false);
  assert.equal(await sensitiveAuthAllowed(client("verified", "aal2")), true);
  await assert.rejects(() => sensitiveAuthAllowed(client("verified", "aal2", { status: 503 })));
});

test("MFA actions enforce owner, origin/rate check, and AAL2 before factor removal", async () => {
  let mutationAllowed = true, aal2 = false, calls = 0;
  const state = { factors: [{ id: "owned", status: "verified", factor_type: "totp" }], enrolled: true };
  const actions = loadModule("lib/auth/mfa-actions.ts", {
    "./admin": { requireAdmin: async () => ({ user: { id: "user" } }) },
    "./mutation": { allowAuthMutation: async () => mutationAllowed },
    "./mfa-policy": { readMfaState: async () => ({ ...state, aal2 }), sensitiveAuthAllowed: async () => aal2 },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { mfa: {
      unenroll: async () => { calls++; return { error: null }; },
      challengeAndVerify: async () => { calls++; return { error: null }; },
    } } }) },
  });
  assert.ok((await actions.removeMfa("owned")).error);
  aal2 = true;
  assert.ok((await actions.removeMfa("another-user-factor")).error);
  assert.ok((await actions.verifyMfa("another-user-factor", "123456")).error);
  mutationAllowed = false;
  assert.ok((await actions.verifyMfa("owned", "123456")).error);
  assert.equal(calls, 0);
  mutationAllowed = true;
  assert.ok((await actions.removeMfa("owned")).message);
  assert.equal(calls, 1);
});

test("password recovery cannot bypass OTP proof or enrolled MFA", async () => {
  let otpValid = false, aal2 = false, updates = 0, globalSignouts = 0;
  const client = { auth: {
    verifyOtp: async () => ({ data: { user: otpValid ? { id: "user" } : null }, error: otpValid ? null : { status: 403 } }),
    mfa: { challengeAndVerify: async ({ code }) => {
      if (code !== "123456") return { error: { status: 400 } };
      aal2 = true; return { error: null };
    } },
    updateUser: async () => { updates++; return { error: null }; },
    signOut: async ({ scope }) => { if (scope === "global") globalSignouts++; return { error: null }; },
  } };
  const actions = loadModule("lib/auth/actions.ts", {
    "next/navigation": { redirect: (path) => { throw new Error(`redirect:${path}`); } },
    "@/lib/supabase/server": { createClient: async () => client },
    "./admin": { requireAdmin: async () => { throw new Error("Not used for proof-based recovery"); } },
    "./session": { readAdminSessionContext: async () => ({ role: "staff" }) },
    "./mutation": { allowAuthMutation: async () => true },
    "./mfa-policy": {
      sensitiveAuthAllowed: async () => aal2,
      readMfaState: async () => ({ factors: [{ id: "owned", status: "verified", factor_type: "totp" }] }),
    },
  });
  const form = new FormData();
  form.set("password", "long-test-password"); form.set("confirmation", "long-test-password");
  form.set("token_hash", "a".repeat(64)); form.set("type", "recovery");
  assert.ok((await actions.resetPassword({}, form)).error);
  otpValid = true;
  assert.ok((await actions.resetPassword({}, form)).error);
  form.set("mfa_code", "000000");
  assert.ok((await actions.resetPassword({}, form)).error);
  assert.equal(updates, 0);
  form.set("mfa_code", "123456");
  await assert.rejects(() => actions.resetPassword({}, form), /redirect:\/admin\/login\?password=updated/);
  assert.equal(updates, 1);
  assert.equal(globalSignouts, 1);
});
