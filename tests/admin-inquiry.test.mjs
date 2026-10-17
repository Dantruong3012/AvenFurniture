import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { loadModule } from "./helpers/load-module.mjs";

const id = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const { parseInquiryPortalQuery, validateInquiryNote } = loadModule("lib/validation/inquiry.ts");
const form = (values) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

test("portal query parsing accepts only scalar bounded filters and existing statuses", () => {
  assert.deepEqual(parseInquiryPortalQuery({}), { page: 1, status: "all", q: "", inquiry: undefined });
  for (const status of ["all", "new", "consulting", "completed", "cancelled"]) {
    assert.deepEqual(parseInquiryPortalQuery({ page: "2", status, q: " a%,)_ ", inquiry: id }), { page: 2, status, q: "a%,)_", inquiry: id });
  }
  for (const invalid of [{ page: "0" }, { page: "10001" }, { page: "1.5" }, { page: "1e2" }, { page: ["2"] }, { status: "bad" }, { status: ["new"] }, { q: ["x"] }, { q: "x".repeat(201) }, { q: "a\0" }, { inquiry: "bad" }, { inquiry: [id] }]) {
    assert.throws(() => parseInquiryPortalQuery(invalid));
  }
  assert.equal(parseInquiryPortalQuery({ page: "10000", q: "x".repeat(200) }).page, 10000);
});

test("staff note validation trims notes and enforces length, type and null-byte limits", () => {
  assert.equal(validateInquiryNote("  Called customer\nMore detail  "), "Called customer\nMore detail");
  assert.equal(validateInquiryNote("x".repeat(10000)).length, 10000);
  for (const body of [undefined, null, 1, {}, "", " \n ", "a\0b", "x".repeat(10001)]) assert.throws(() => validateInquiryNote(body));
});

function actions({ authError, allow = true, mutationError } = {}) {
  const calls = [], invalidations = [], guards = [];
  const client = {};
  const loaded = loadModule("lib/inquiries/actions.ts", {
    "@/lib/auth/admin": { requireAdmin: async () => { guards.push("auth"); if (authError) throw authError; return { supabase: client, user: { id } }; } },
    "@/lib/auth/mutation": { allowAuthMutation: async (...args) => { guards.push(args); return allow; } },
    "@/lib/repositories/supabaseInquiryRepository": {
      updateAdminInquiryStatus: async (...args) => { calls.push(["status", ...args]); if (mutationError) throw mutationError; },
      addAdminInquiryNote: async (...args) => { calls.push(["note", ...args]); if (mutationError) throw mutationError; },
    },
    "next/cache": { revalidatePath: (path) => invalidations.push(path) },
  });
  return { ...loaded, calls, invalidations, guards, client };
}

test("both mutation entry points reauthorize and reject origin/rate-limit denial before repository access", async () => {
  for (const name of ["changeInquiryStatus", "createInquiryNote"]) {
    const request = form({ id, status: "consulting", body: "Called" });
    const authError = new Error("redirect:/admin/login");
    const denied = actions({ authError });
    await assert.rejects(denied[name]({}, request), (error) => error === authError);
    assert.deepEqual(denied.guards, ["auth"]);
    assert.deepEqual(denied.calls, []);
    const limited = actions({ allow: false });
    assert.ok((await limited[name]({}, request)).error);
    assert.equal(limited.guards[0], "auth");
    assert.equal(limited.guards[1][1], id);
    assert.deepEqual(limited.calls, []);
    assert.deepEqual(limited.invalidations, []);
  }
});

test("mutation actions reject forged inputs and ignore supplied author/assignee fields", async () => {
  const a = actions();
  for (const values of [{ id: "bad", status: "new" }, { id }, { id, status: "all" }, { id, status: "bad" }]) assert.ok((await a.changeInquiryStatus({}, form(values))).error);
  for (const values of [{ id: "bad", body: "note" }, { id }, { id, body: "\0" }, { id, body: " " }, { id, body: "x".repeat(10001) }]) assert.ok((await a.createInquiryNote({}, form(values))).error);
  assert.equal(a.calls.length, 0);
  for (const status of ["new", "consulting", "completed", "cancelled"]) {
    assert.deepEqual(await a.changeInquiryStatus({}, form({ id, status, assignee_id: otherId })), { success: "Status updated." });
    assert.deepEqual(a.calls.at(-1), ["status", a.client, id, status]);
  }
  assert.deepEqual(await a.createInquiryNote({}, form({ id, body: "  Called\nTomorrow  ", author_id: otherId })), { success: "Internal note added." });
  assert.deepEqual(a.calls.at(-1), ["note", a.client, id, "Called\nTomorrow"]);
  assert.deepEqual(a.invalidations, Array(5).fill("/admin/inquiries"));
  assert.equal(a.guards.filter((entry) => entry === "auth").length, 14);
});

test("mutation failure never reports success, leaks database text or revalidates", async () => {
  for (const name of ["changeInquiryStatus", "createInquiryNote"]) {
    const a = actions({ mutationError: new Error("private database details") });
    const result = await a[name]({}, form({ id, status: "completed", body: "Note" }));
    assert.ok(result.error);
    assert.doesNotMatch(result.error, /private database details/);
    assert.equal(result.success, undefined);
    assert.deepEqual(a.invalidations, []);
  }
});

// Render actual TSX locally with stubbed framework boundaries; no HTTP or live data.
const nativeRequire = createRequire(import.meta.url);
function loadTsx(filename, overrides, globals = {}) {
  // Next compiles styled-jsx; plain React SSR only needs the style content.
  const source = readFileSync(new URL(`../${filename}`, import.meta.url), "utf8").replaceAll("<style jsx>", "<style>");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", ...Object.keys(globals), code)((name) => {
    if (name in overrides) return overrides[name];
    return nativeRequire(name);
  }, loaded, loaded.exports, ...Object.values(globals));
  return loaded.exports;
}
const Link = ({ href, children, scroll, ...props }) => {
  void scroll;
  return React.createElement("a", { href, ...props }, children);
};
const summary = { id, reference: 42, created_at: "2026-10-17T01:00:00Z", contact_name: "Customer <script>", contact_phone: "0901234567", contact_email: "customer@example.com", source: "cart", status: "new", item_count: 1 };
const detail = { ...summary, message: "  Verbatim\n<script>alert(1)</script>  ", inquiry_items: [{ id, product_name: "Oak chair", product_slug: "oak-chair", quantity: 2, unit_price: null, currency: "USD" }], inquiry_notes: [{ id, body: "  Internal\n<script>note</script>  ", created_at: summary.created_at, author_id: id }] };

test("inquiry page authorizes before reads and forwards validated paging, filters and selected ID", async () => {
  const calls = [], client = {};
  const metrics = { total: 1, byStatus: { new: { count: 1, percentage: 100 }, consulting: { count: 0, percentage: 0 }, completed: { count: 0, percentage: 0 }, cancelled: { count: 0, percentage: 0 } }, last7Days: 1, last30Days: 1 };
  const page = loadTsx("app/admin/(protected)/inquiries/page.tsx", {
    "next/link": { default: Link },
    "@/lib/auth/admin": { requireAdmin: async () => { calls.push("auth"); return { supabase: client, user: { id } }; } },
    "@/lib/validation/inquiry": { parseInquiryPortalQuery },
    "@/components/admin/inquiry-portal": { InquiryPortal: () => null },
    "@/lib/repositories/supabaseInquiryRepository": {
      listAdminInquiries: async (...args) => { calls.push(["list", ...args]); return { inquiries: [summary], count: 30 }; },
      getAdminInquiryById: async (...args) => { calls.push(["detail", ...args]); return detail; },
      getAdminInquiryMetrics: async () => metrics,
    },
  }).default;
  const result = await page({ searchParams: Promise.resolve({ page: "2", q: " Customer ", status: "all", inquiry: id }) });
  assert.equal(calls[0], "auth");
  assert.deepEqual(calls[1], ["list", client, { page: 2, pageSize: 25, q: "Customer", status: "all", inquiry: id }]);
  assert.deepEqual(calls[2], ["detail", client, id]);
  assert.equal(result.props.detail, detail);
  assert.equal(result.props.metrics, metrics);
  assert.equal(result.props.currentUserId, id);
  calls.length = 0;
  const invalid = await page({ searchParams: Promise.resolve({ inquiry: "bad" }) });
  assert.deepEqual(calls, ["auth"]);
  assert.match(renderToStaticMarkup(invalid), /Invalid inquiry filters/);
  calls.length = 0;
  await page({ searchParams: Promise.resolve({}) });
  assert.equal(calls.length, 2, "no detail query until a row is selected");
});

test("inquiry page preserves the authentication redirect without issuing reads", async () => {
  const redirect = new Error("redirect:/admin/login");
  const page = loadTsx("app/admin/(protected)/inquiries/page.tsx", {
    "next/link": { default: Link },
    "@/lib/auth/admin": { requireAdmin: async () => { throw redirect; } },
    "@/lib/validation/inquiry": { parseInquiryPortalQuery },
    "@/components/admin/inquiry-portal": {},
    "@/lib/repositories/supabaseInquiryRepository": { listAdminInquiries: () => assert.fail("unauthorized read") },
  }).default;
  await assert.rejects(page({ searchParams: Promise.resolve({}) }), (error) => error === redirect);
});

test("portal renders contact data, encoded navigation, status controls, verbatim safe content and empty states", () => {
  const { InquiryPortal } = loadTsx("components/admin/inquiry-portal.tsx", {
    "next/link": { default: Link },
    "next/navigation": { useRouter: () => ({ replace() {} }) },
    "@/components/ui/icons": { CloseIcon: () => null, SearchIcon: () => null },
    "@/lib/inquiries/actions": { changeInquiryStatus: async () => ({}), createInquiryNote: async () => ({}) },
    "@/lib/validation/inquiry": loadModule("lib/validation/inquiry.ts"),
  });
  const props = { inquiries: [summary], count: 60, pageSize: 25, filters: { page: 2, status: "new", q: "a&b" }, detail: null, currentUserId: id };
  const html = renderToStaticMarkup(React.createElement(InquiryPortal, props));
  assert.match(html, /Customer &lt;script&gt;/);
  for (const text of ["0901234567", "customer@example.com", "cart", "#42", "Page 2 of 3"]) assert.ok(html.includes(text));
  assert.match(html, /status=new&amp;page=1&amp;q=a%26b/);
  assert.match(html, /status=new&amp;page=3&amp;q=a%26b/);
  assert.match(html, /status=completed&amp;page=1&amp;q=a%26b/);
  assert.match(html, /aria-current="page">New/);
  assert.match(html, new RegExp(`inquiry=${id}`));
  const opened = renderToStaticMarkup(React.createElement(InquiryPortal, { ...props, filters: { ...props.filters, inquiry: id }, detail }));
  assert.match(opened, /<dialog[^>]*aria-labelledby="inquiry-detail-title"/);
  assert.match(opened, /  Verbatim\n&lt;script&gt;alert\(1\)&lt;\/script&gt;  /);
  assert.match(opened, /  Internal\n&lt;script&gt;note&lt;\/script&gt;  /);
  assert.match(opened, /Oak chair/);
  assert.match(opened, /Quote requested/);
  assert.match(opened, /maxLength="10000"/);
  for (const status of ["new", "consulting", "completed", "cancelled"]) assert.ok(opened.includes(`value="${status}"`));
  assert.doesNotMatch(opened, /<script>(?:alert\(1\)|note)<\/script>/);
  const missing = renderToStaticMarkup(React.createElement(InquiryPortal, { ...props, inquiries: [], count: 0, filters: { ...props.filters, inquiry: id } }));
  assert.match(missing, /No inquiries found/);
  assert.match(missing, /Inquiry unavailable/);
  assert.doesNotMatch(missing, /Add an internal note/);
});

function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap((node) => nodes(node, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}

test("drawer opens modally, restores focus, protects pending changes and preserves failed note drafts", async () => {
  const slots = [], effects = [], navigations = [];
  let cursor = 0, finishNote;
  const react = {
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], (value) => { slots[index] = value; }]; },
    useEffect(effect) { effects.push(effect); },
    useActionState(action, initial) {
      const index = cursor++;
      const slot = slots[index] ??= { state: initial, pending: false };
      return [slot.state, async (data) => {
        slot.pending = true;
        try { slot.state = await action(slot.state, data); }
        finally { slot.pending = false; }
      }, slot.pending];
    },
  };
  class Element { focused = false; focus() { this.focused = true; } }
  const trigger = new Element(), search = new Element();
  let rowPresent = true;
  const document = { activeElement: trigger, body: { style: { overflow: "auto" } }, getElementById: (key) => key === `inquiry-${id}` ? (rowPresent ? trigger : null) : search };
  const { InquiryPortal } = loadTsx("components/admin/inquiry-portal.tsx", {
    react,
    "next/link": { default: Link },
    "next/navigation": { useRouter: () => ({ replace: (...args) => navigations.push(args) }) },
    "@/components/ui/icons": { CloseIcon: () => null, SearchIcon: () => null },
    "@/lib/inquiries/actions": { changeInquiryStatus: async () => ({ success: "Updated" }), createInquiryNote: () => new Promise((resolve) => { finishNote = resolve; }) },
    "@/lib/validation/inquiry": loadModule("lib/validation/inquiry.ts"),
  }, { document, HTMLElement: Element });
  const tree = InquiryPortal({ inquiries: [summary], count: 1, pageSize: 25, filters: { page: 1, status: "new", q: "", inquiry: id }, detail, currentUserId: id });
  const drawer = nodes(tree, (node) => typeof node.type === "function" && node.props.closeHref)[0];
  const render = () => { cursor = 0; effects.length = 0; return drawer.type(drawer.props); };
  let rendered = render();
  const dialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  rendered.props.ref.current = dialog;
  const cleanup = effects[0]();
  assert.equal(dialog.open, true);
  assert.equal(document.body.style.overflow, "hidden");
  const textarea = () => nodes(rendered, (node) => node.type === "textarea")[0];
  textarea().props.onChange({ target: { value: "Keep my draft" } });
  rendered = render();
  const noteForm = nodes(rendered, (node) => node.type === "form")[1];
  const saving = noteForm.props.action(form({ id, body: "Keep my draft" }));
  rendered = render();
  assert.equal(textarea().props.disabled, true);
  assert.ok(nodes(rendered, (node) => node.type === "button").every((node) => node.props.disabled));
  let prevented = false;
  rendered.props.onCancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(navigations, []);
  finishNote({ error: "Failed" });
  await saving;
  rendered = render();
  assert.equal(textarea().props.value, "Keep my draft");
  const retry = nodes(rendered, (node) => node.type === "form")[1].props.action(form({ id, body: "Keep my draft" }));
  finishNote({ success: "Added" });
  await retry;
  rendered = render();
  assert.equal(textarea().props.value, "");
  rendered.props.onCancel({ preventDefault() {} });
  assert.deepEqual(navigations, [["/admin/inquiries?status=new&page=1", { scroll: false }]]);
  rowPresent = false;
  cleanup();
  assert.equal(dialog.open, false);
  assert.equal(document.body.style.overflow, "auto");
  assert.equal(search.focused, true, "focus falls back to search if status filtering removed the trigger row");
});

test("staff shell exposes the inquiries route with an active navigation state", () => {
  const { CatalogShell } = loadTsx("components/admin/catalog-shell.tsx", {
    "next/link": { default: Link },
    "next/navigation": { usePathname: () => "/admin/inquiries" },
    "@/lib/auth/actions": { signOut: async () => {} },
  });
  const html = renderToStaticMarkup(React.createElement(CatalogShell, { role: "staff", name: "Staff" }, "Portal"));
  assert.match(html, /href="\/admin\/inquiries" aria-current="page"/);
  assert.match(html, /Customer requests/);
});
