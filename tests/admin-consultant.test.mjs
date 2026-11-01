import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { loadModule } from "./helpers/load-module.mjs";

const id = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const version = "2026-10-17T01:00:00.123456+00:00";
const profile = { user_id: id, public_name: "Linh <script>", avatar_url: null, zalo_phone: "0901234567", sort_order: 0, enabled: true, created_at: version, updated_at: version };
const members = [{ user_id: id, display_name: "Linh", active: true }, { user_id: otherId, display_name: "An", active: false }];
const form = (values = {}) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({ user_id: id, public_name: "Linh", avatar_url: "", zalo_phone: "+84901234567", sort_order: "0", mode: "create", ...values })) data.set(key, value);
  return data;
};

// Exercise the real PostgREST request builder; all requests end at this in-memory fetch.
function clientWithFetch(handler) {
  return createClient("https://consultants.invalid", "fixture-public-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: handler },
  });
}
function actions({ authError, allow = true, response = { user_id: id }, status = 200, throws = false } = {}) {
  const calls = [], guards = [], invalidations = [], redirects = [];
  const client = clientWithFetch(async (url, init) => {
    calls.push({ url: new URL(url), method: init.method, body: init.body ? JSON.parse(init.body) : undefined });
    if (throws) throw new Error("private network details");
    return new Response(JSON.stringify(response), { status, headers: { "Content-Type": "application/json" } });
  });
  const loaded = loadModule("lib/consultants/actions.ts", {
    "@/lib/auth/admin": { requireAdmin: async (role) => { guards.push(["auth", role]); if (authError) throw authError; return { supabase: client, user: { id: otherId } }; } },
    "@/lib/auth/mutation": { allowAuthMutation: async (...args) => { guards.push(args); return allow; } },
    "next/cache": { revalidatePath: (path) => invalidations.push(path) },
    "next/navigation": { redirect: (path) => { redirects.push(path); throw new Error(`redirect:${path}`); } },
  });
  return { ...loaded, calls, guards, invalidations, redirects };
}

test("every consultant action requires a super admin and origin/rate approval before accessing data", async () => {
  for (const name of ["saveConsultant", "deleteConsultant"]) {
    const authError = new Error("redirect:/admin/access-denied");
    const denied = actions({ authError });
    await assert.rejects(denied[name]({}, form()), (error) => error === authError);
    assert.deepEqual(denied.guards, [["auth", "super_admin"]]);
    assert.deepEqual(denied.calls, []);
    const limited = actions({ allow: false });
    assert.match((await limited[name]({}, form())).error, /Request denied/);
    assert.deepEqual(limited.guards[0], ["auth", "super_admin"]);
    assert.equal(limited.guards[1][1], otherId, "limiter uses the authenticated actor, not the submitted member");
    assert.deepEqual(limited.calls, []);
    assert.deepEqual(limited.invalidations, []);
  }
});

test("save rejects invalid fields, modes and missing versions without a write", async () => {
  const a = actions();
  for (const values of [{ user_id: "bad" }, { public_name: "" }, { zalo_phone: "090 1234567" }, { avatar_url: "javascript:alert(1)" }, { sort_order: "1.5" }, { enabled: "true" }, { mode: "upsert" }, { mode: "update" }, { mode: "update", updated_at: "not-a-date" }]) {
    const result = await a.saveConsultant({}, form(values));
    assert.ok(result.error);
    assert.equal(result.values.public_name, values.public_name ?? "Linh");
  }
  assert.deepEqual(a.calls, []);
  assert.deepEqual(a.invalidations, []);
});

test("create inserts only consultant fields, defaults hidden and revalidates both routes before redirect", async () => {
  const a = actions();
  await assert.rejects(a.saveConsultant({}, form({ role: "super_admin", active: "true", created_at: "forged" })), /redirect:\/admin\/consultants\?saved=1/);
  assert.equal(a.calls.length, 1);
  const request = a.calls[0];
  assert.equal(request.method, "POST");
  assert.equal(request.url.pathname, "/rest/v1/consultant_profiles");
  assert.deepEqual(request.body, { user_id: id, public_name: "Linh", avatar_url: null, zalo_phone: "+84901234567", sort_order: 0, enabled: false });
  assert.equal(request.url.searchParams.get("on_conflict"), null, "never overwrite existing profiles with upsert");
  assert.deepEqual(a.invalidations, ["/consultants", "/admin/consultants"]);
  assert.deepEqual(a.redirects, ["/admin/consultants?saved=1"]);
});

test("update changes ordering and visibility atomically with a microsecond-precision version predicate", async () => {
  for (const enabled of ["on", ""]) {
    const a = actions();
    await assert.rejects(a.saveConsultant({}, form({ mode: "update", updated_at: version, enabled, sort_order: "-4" })), /redirect:/);
    const request = a.calls[0];
    assert.equal(request.method, "PATCH");
    assert.equal(request.url.searchParams.get("user_id"), `eq.${id}`);
    assert.equal(request.url.searchParams.get("updated_at"), `eq.${version}`);
    assert.deepEqual(request.body, { public_name: "Linh", avatar_url: null, zalo_phone: "+84901234567", sort_order: -4, enabled: enabled === "on" });
  }
});

test("save preserves submitted values and does not report success for conflicts, missing members, permission or transport failures", async () => {
  for (const [options, message] of [
    [{ status: 409, response: { code: "23505", message: "private constraint" } }, /already has a consultant profile/],
    [{ status: 409, response: { code: "23503", message: "private constraint" } }, /no longer available/],
    [{ status: 403, response: { code: "42501", message: "private permissions" } }, /permissions/],
    [{ response: [] }, /changed or was deleted/],
    [{ throws: true }, /Unable to save/],
  ]) {
    const a = actions(options);
    const result = await a.saveConsultant({}, form({ mode: "update", updated_at: version, public_name: "My unsaved draft" }));
    assert.match(result.error, message);
    assert.doesNotMatch(result.error, /private/);
    assert.equal(result.values.public_name, "My unsaved draft");
    assert.deepEqual(a.invalidations, []);
    assert.deepEqual(a.redirects, []);
  }
});

test("delete requires confirmation and version, only deletes the consultant row, and handles concurrent deletion", async () => {
  const a = actions();
  for (const values of [{}, { confirmed: "on" }, { confirmed: "on", updated_at: "bad" }, { confirmed: "on", updated_at: version, user_id: "bad" }]) assert.ok((await a.deleteConsultant({}, form(values))).error);
  assert.deepEqual(a.calls, []);
  const request = form({ confirmed: "on", updated_at: version });
  await assert.rejects(a.deleteConsultant({}, request), /redirect:\/admin\/consultants\?deleted=1/);
  assert.equal(a.calls[0].method, "DELETE");
  assert.equal(a.calls[0].url.pathname, "/rest/v1/consultant_profiles");
  assert.equal(a.calls[0].url.searchParams.get("user_id"), `eq.${id}`);
  assert.equal(a.calls[0].url.searchParams.get("updated_at"), `eq.${version}`);
  assert.deepEqual(a.invalidations, ["/consultants", "/admin/consultants"]);
  for (const options of [{ response: [] }, { throws: true }, { status: 403, response: { code: "42501", message: "private" } }]) {
    const failed = actions(options);
    const result = await failed.deleteConsultant({}, request);
    assert.ok(result.error);
    assert.doesNotMatch(result.error, /private/);
    assert.deepEqual(failed.invalidations, []);
    assert.deepEqual(failed.redirects, []);
  }
});

test("admin query authorizes before reading; public query only calls the public repository", async () => {
  for (const authorized of [true, false]) {
    const calls = [], client = {};
    const queries = loadModule("lib/consultants/queries.ts", {
      "server-only": {},
      "@/lib/auth/admin": { requireAdmin: async (role) => { calls.push(role); if (!authorized) throw new Error("denied"); return { supabase: client }; } },
      "@/lib/repositories/supabaseConsultantRepository": {
        listAdminConsultants: async (received) => { assert.equal(received, client); calls.push("admin read"); return { profiles: [profile], members }; },
        listPublicConsultants: async () => { calls.push("public RPC"); return []; },
      },
    });
    assert.deepEqual(await queries.readPublicConsultants(), []);
    assert.deepEqual(calls, ["public RPC"]);
    calls.length = 0;
    if (authorized) assert.deepEqual(await queries.readAdminConsultants(), { profiles: [profile], members });
    else await assert.rejects(queries.readAdminConsultants(), /denied/);
    assert.deepEqual(calls, authorized ? ["super_admin", "admin read"] : ["super_admin"]);
  }
});

test("admin repository pages profiles and members using stable ordering and propagates safe read errors", async () => {
  const { listAdminConsultants } = loadModule("lib/repositories/supabaseConsultantRepository.ts", { "server-only": {} });
  const calls = [];
  const client = clientWithFetch(async (url) => {
    const parsed = new URL(url);
    calls.push(parsed);
    const isProfiles = parsed.pathname.endsWith("/consultant_profiles");
    const row = isProfiles ? profile : members[0];
    const rows = parsed.searchParams.get("offset") === "0" ? Array(1000).fill(row) : [row];
    return new Response(JSON.stringify(rows), { headers: { "Content-Type": "application/json" } });
  });
  const result = await listAdminConsultants(client);
  assert.equal(result.profiles.length, 1001);
  assert.equal(result.members.length, 1001);
  assert.deepEqual(calls.map((url) => [url.searchParams.get("offset"), url.searchParams.get("limit")]), [["0", "1000"], ["1000", "1000"], ["0", "1000"], ["1000", "1000"]]);
  assert.equal(calls[0].searchParams.get("order"), "sort_order.asc,public_name.asc,user_id.asc");
  assert.equal(calls[2].searchParams.get("order"), "display_name.asc,user_id.asc");
  assert.equal(calls[2].searchParams.get("select"), "user_id,display_name,active");
  for (const failingTable of ["consultant_profiles", "admin_profiles"]) {
    const failing = clientWithFetch(async (url) => new Response(JSON.stringify(new URL(url).pathname.endsWith(`/${failingTable}`) ? { message: "private details" } : []), { status: new URL(url).pathname.endsWith(`/${failingTable}`) ? 403 : 200, headers: { "Content-Type": "application/json" } }));
    await assert.rejects(listAdminConsultants(failing), (error) => /could not be loaded/.test(error.message) && !error.message.includes("private"));
  }
});

const nativeRequire = createRequire(import.meta.url);
function loadTsx(filename, overrides = {}) {
  const code = ts.transpileModule(readFileSync(new URL(`../${filename}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", code)((name) => {
    if (name in overrides) return overrides[name];
    if (name.startsWith("@/components/")) return loadTsx(`${name.slice(2)}.tsx`, overrides);
    return nativeRequire(name);
  }, loaded, loaded.exports);
  return loaded.exports;
}
const Link = ({ children, ...props }) => React.createElement("a", props, children);
const ui = { "next/link": { default: Link }, "@/lib/consultants/actions": { saveConsultant: async () => ({}), deleteConsultant: async () => ({}) } };
const markup = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));

test("admin management renders escaped profiles, inactive visibility, empty and missing states, and existing-member creation", () => {
  const { ConsultantManagement } = loadTsx("components/admin/consultant-management.tsx", ui);
  const props = { profiles: [profile], members, saved: false, deleted: false };
  const html = markup(ConsultantManagement, props);
  assert.match(html, /Linh &lt;script&gt;/);
  assert.match(html, /Visible/);
  assert.match(html, new RegExp(`href="/admin/consultants\\?edit=${id}"`));
  assert.match(markup(ConsultantManagement, { ...props, members: members.map((m) => ({ ...m, active: false })) }), /Hidden \(inactive account\)/);
  assert.match(markup(ConsultantManagement, { ...props, profiles: [] }), /No consultant profiles yet/);
  assert.match(markup(ConsultantManagement, { ...props, edit: "missing" }), /role="alert"/);
  const create = markup(ConsultantManagement, { ...props, edit: "new" });
  assert.match(create, new RegExp(`<option value="${otherId}">An \\(inactive\\)`));
  assert.doesNotMatch(create, new RegExp(`<option value="${id}"`));
  assert.match(create, /name="mode" value="create"/);
  assert.doesNotMatch(create, /name="enabled"[^>]*checked/);
  const edit = markup(ConsultantManagement, { ...props, edit: id, saved: true });
  assert.match(edit, /Consultant saved/);
  assert.match(edit, /name="mode" value="update"/);
  assert.match(edit, /name="updated_at"/);
  assert.match(edit, /The team account will be kept/);
  assert.match(edit, /name="confirmed"/);
});

test("admin page forwards scalar selection, preserves auth errors and restricts navigation to super admins", async () => {
  const overrides = { ...ui, "@/lib/consultants/queries": { readAdminConsultants: async () => ({ profiles: [profile], members }) } };
  const page = loadTsx("app/admin/(protected)/consultants/page.tsx", overrides).default;
  const rendered = await page({ searchParams: Promise.resolve({ edit: id, saved: "1" }) });
  assert.equal(rendered.props.edit, id);
  assert.equal(rendered.props.saved, true);
  assert.equal((await page({ searchParams: Promise.resolve({ edit: [id], saved: ["1"] }) })).props.edit, undefined);
  const rejected = loadTsx("app/admin/(protected)/consultants/page.tsx", { ...overrides, "@/lib/consultants/queries": { readAdminConsultants: async () => { throw new Error("redirect:/admin/access-denied"); } } }).default;
  await assert.rejects(rejected({ searchParams: Promise.resolve({}) }), /redirect:/);
  const { CatalogShell } = loadTsx("components/admin/catalog-shell.tsx", { ...ui, "next/navigation": { usePathname: () => "/admin/consultants" }, "@/lib/auth/actions": { signOut: async () => {} } });
  assert.match(markup(CatalogShell, { name: "Admin", role: "super_admin" }), /href="\/admin\/consultants" aria-current="page"/);
  assert.doesNotMatch(markup(CatalogShell, { name: "Staff", role: "staff" }), /href="\/admin\/consultants"/);
});

function nodes(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap((node) => nodes(node, predicate));
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}

test("consultant editor keeps controlled drafts after server errors and disables inputs while pending", async () => {
  const slots = [];
  let cursor = 0, finish;
  const react = {
    startTransition: (fn) => fn(),
    useState: (initial) => { const index = cursor++; slots[index] ??= initial; return [slots[index], (value) => { slots[index] = value; }]; },
    useActionState: (action, initial) => {
      const index = cursor++;
      const slot = slots[index] ??= { state: initial, pending: false };
      return [slot.state, async (data) => { slot.pending = true; try { slot.state = await action(slot.state, data); } finally { slot.pending = false; } }, slot.pending];
    },
  };
  const { ConsultantForm } = loadTsx("components/admin/consultant-form.tsx", { ...ui, react, "@/lib/consultants/actions": { saveConsultant: () => new Promise((resolve) => { finish = resolve; }), deleteConsultant: async () => ({}) } });
  const render = () => { cursor = 0; return ConsultantForm({ profile, members }); };
  let tree = render();
  nodes(tree, (node) => node.props?.name === "public_name")[0].props.onChange({ target: { value: "Keep this draft" } });
  tree = render();
  const saving = nodes(tree, (node) => node.type === "form")[0].props.action(form());
  tree = render();
  assert.equal(nodes(tree, (node) => node.type === "fieldset")[0].props.disabled, true);
  finish({ error: "Validation failed", fields: { public_name: "Please correct the name" } });
  await saving;
  tree = render();
  const input = nodes(tree, (node) => node.props?.name === "public_name")[0];
  assert.equal(input.props.value, "Keep this draft");
  assert.equal(input.props["aria-invalid"], true);
  assert.equal(input.props["aria-describedby"], "consultant-public_name-error");
  assert.equal(nodes(tree, (node) => node.props?.role === "alert")[0].props.children, "Validation failed");
  assert.equal(nodes(tree, (node) => node.type === "fieldset")[0].props.disabled, false);
});
