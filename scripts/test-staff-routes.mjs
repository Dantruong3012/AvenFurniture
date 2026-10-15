import { createServerClient } from "@supabase/ssr";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
const projectRef = "eofdtqnnqgxaoykcbfrv";

let stage = "configuration", server, client;
const check = (value) => { if (!value) throw new Error("Check failed"); };
try {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  check(process.env.SUPABASE_SECRET_KEY && url === `https://${projectRef}.supabase.co`);
  const cookies = new Map();
  client = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: (values) => values.forEach(({ name, value }) => value ? cookies.set(name, value) : cookies.delete(name)),
    },
  });
  stage = "staff login";
  const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const staffEmail = "staff-test-eofdtqnnqgxaoykcbfrv@example.com";
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: staffEmail });
  check(!link.error);
  const login = await client.auth.verifyOtp({ type: "magiclink", token_hash: link.data.properties.hashed_token });
  check(!login.error && login.data.user?.email === staffEmail);
  const id = login.data.user.id;
  stage = "own profile read and role update denied";
  const own = await client.from("admin_profiles").select("user_id,role");
  check(!own.error && own.data.length === 1 && own.data[0].user_id === id && own.data[0].role === "staff");
  // Use a no-op role value: proves UPDATE is denied without risking elevation.
  const update = await client.from("admin_profiles").update({ role: "staff" }).eq("user_id", id).select("user_id");
  check(update.error?.code === "42501" || (!update.error && update.data.length === 0));
  const audit = await client.from("audit_logs").select("id").limit(1);
  check(!audit.error && audit.data.length === 0);
  console.log("PASS: own staff profile only; profile role UPDATE denied; audit rows hidden.");
  stage = "start production app on localhost";
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3198"], { stdio: "ignore" });
  await delay(1500);
  check(server.exitCode === null);
  const cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  for (const path of ["/admin", "/admin/settings/security"]) {
    stage = `authenticated route ${path}`;
    const response = await fetch(`http://127.0.0.1:3198${path}`, { headers: { cookie }, redirect: "manual", signal: AbortSignal.timeout(20000) });
    check(response.status === 200 && /no-store/.test(response.headers.get("cache-control")));
  }
  console.log("PASS: staff SSR cookies authorize admin and security routes; private/no-store headers.");
  stage = "public login security headers and missing-origin mutation";
  const loginPage = await fetch("http://127.0.0.1:3198/admin/login");
  check(loginPage.headers.get("x-frame-options") === "DENY" && loginPage.headers.get("x-content-type-options") === "nosniff");
  const html = await loginPage.text();
  const actionInputs = [...html.matchAll(/<input\b[^>]*name="\$ACTION_[^"]+"[^>]*>/g)];
  check(actionInputs.length > 0);
  const form = new FormData();
  const decode = (value) => value.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  for (const [input] of actionInputs) {
    const name = input.match(/name="([^"]+)"/)[1];
    form.set(decode(name), decode(input.match(/value="([^"]*)"/)?.[1] ?? ""));
  }
  form.set("email", "nobody@example.com"); form.set("password", "invalid-password");
  const csrf = await fetch("http://127.0.0.1:3198/admin/login", { method: "POST", body: form, redirect: "manual", headers: { Origin: "https://untrusted.example" } });
  check(csrf.status >= 400);
  console.log("PASS: cross-origin bound Server Action rejected.");
  stage = "logout and replay stale SSR cookie";
  check(!(await client.auth.signOut({ scope: "local" })).error);
  const response = await fetch("http://127.0.0.1:3198/admin", { headers: { cookie }, redirect: "manual", signal: AbortSignal.timeout(20000) });
  check(response.status === 307 && new URL(response.headers.get("location"), "http://127.0.0.1:3198").pathname === "/admin/login");
  console.log("PASS: logged-out SSR cookie cannot access admin route.");
} catch {
  console.error(`FAIL: ${stage}. No credentials or response bodies printed.`);
  process.exitCode = 1;
} finally {
  if (client) { try { await client.auth.signOut({ scope: "local" }); } catch { /* no logging */ } }
  server?.kill("SIGTERM");
}
