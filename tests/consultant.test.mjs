import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { loadModule } from "./helpers/load-module.mjs";

const validation = loadModule("lib/validation/consultant.ts");
const { zaloContactUrl, consultantAvatarUrl, validateConsultant } = validation;
const id = "00000000-0000-0000-0000-000000000001";
const form = (overrides = {}) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({ user_id: id, public_name: "Linh", zalo_phone: "0901234567", avatar_url: "", sort_order: "0", ...overrides })) data.set(key, value);
  return data;
};

test("Zalo links accept only the schema phone format, preserve leading zeros and remove only a leading plus", () => {
  for (const phone of ["0901234567", "123456789", "123456789012345", "+84901234567"]) assert.equal(zaloContactUrl(phone), `https://zalo.me/${phone.replace(/^\+/, "")}`);
  for (const phone of ["", "12345678", "1234567890123456", "123456789\n", " 0901234567", "+84 901234567", "++84901234567", "０９０１２３４５６７", "javascript:alert(1)", "0901234567?x=1", "0901234567/path", null]) assert.equal(zaloContactUrl(phone), null, String(phone));
});

test("avatar validation honors Cloudinary schema and rejects deceptive or unsafe URLs", () => {
  const url = "https://res.cloudinary.com/aven/image/upload/avatar.jpg";
  assert.equal(consultantAvatarUrl(url), url);
  for (const value of [null, "", "https://res.cloudinary.com/", "https://other.test/a", "http://res.cloudinary.com/a", "https://res.cloudinary.com.evil.test/a", "https://res.cloudinary.com@evil.test/a", "https://res.cloudinary.com/\\evil", "https://res.cloudinary.com/a\n", "data:image/svg+xml,a", "https://res.cloudinary.com/" + "a".repeat(2048)]) assert.equal(consultantAvatarUrl(value), null);
});

test("profile validation defaults hidden, maps nullable avatar, enforces bounds, and whitelists editable fields", () => {
  const valid = validateConsultant(form({ public_name: "  Linh  ", role: "super_admin", created_at: "forged" }));
  assert.deepEqual(valid.fields, {});
  assert.deepEqual(valid.data, { user_id: id, public_name: "Linh", zalo_phone: "0901234567", avatar_url: null, sort_order: 0, enabled: false });
  assert.equal(validateConsultant(form({ enabled: "on" })).data.enabled, true);
  for (const order of ["-2147483648", "2147483647"]) assert.deepEqual(validateConsultant(form({ sort_order: order })).fields, {});
  for (const [key, values] of Object.entries({ user_id: ["bad", ""], public_name: [" ", "a".repeat(121), "a\0"], zalo_phone: ["bad", "1".repeat(16)], avatar_url: ["https://example.com/photo"], sort_order: ["", "1.5", "1e2", "2147483648", "-2147483649", "Infinity"], enabled: ["true", "false"] })) {
    for (const value of values) assert.ok(validateConsultant(form({ [key]: value })).fields[key], `${key}: ${value}`);
  }
});

function repository(response) {
  const calls = [];
  const loaded = loadModule("lib/repositories/supabaseConsultantRepository.ts", {
    "server-only": {},
    "@/lib/supabase/config": { getSupabaseConfig: () => ({ url: "https://consultants.invalid", publishableKey: "public-test-key" }) },
    "@supabase/supabase-js": { createClient: (...args) => { calls.push(args); return { rpc: async (...args) => { calls.push(args); return response; }, from: () => assert.fail("Public reads must use the filtered RPC") }; } },
  });
  return { ...loaded, calls };
}

test("public repository uses anonymous filtered RPC and maps only public fields, retaining nullable avatar and order", async () => {
  const rows = [{ public_name: "Linh", avatar_url: null, zalo_phone: "0901234567", sort_order: -1, user_id: id, email: "private@example.test" }, { public_name: "An", avatar_url: "https://evil.test/image", zalo_phone: "+84901234567", sort_order: 0 }];
  const r = repository({ data: rows, error: null });
  const result = await r.listPublicConsultants();
  assert.deepEqual(result, rows.map(({ public_name, zalo_phone, sort_order }) => ({ public_name, zalo_phone, sort_order, avatar_url: null })));
  assert.deepEqual(r.calls[0], ["https://consultants.invalid", "public-test-key", { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }]);
  assert.deepEqual(r.calls[1], ["list_public_consultants"]);
  assert.deepEqual(await repository({ data: null, error: null }).listPublicConsultants(), []);
  await assert.rejects(repository({ data: null, error: { message: "private database error" } }).listPublicConsultants(), /^Error: Consultants are temporarily unavailable\.$/);
});

const nativeRequire = createRequire(import.meta.url);
function loadTsx(filename, overrides = {}) {
  const source = readFileSync(new URL(`../${filename}`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", code)((name) => {
    if (name in overrides) return overrides[name];
    if (name.startsWith("@/components/")) return loadTsx(`${name.slice(2)}.tsx`, overrides);
    if (name.startsWith("@/lib/")) return loadModule(`${name.slice(2)}.ts`, overrides);
    return nativeRequire(name);
  }, loaded, loaded.exports);
  return loaded.exports;
}
const Link = ({ children, ...props }) => React.createElement("a", props, children);
const Image = ({ unoptimized, priority, ...props }) => { void unoptimized; void priority; return React.createElement("img", props); };
const ui = { "next/link": { default: Link }, "next/image": { default: Image } };
const consultant = { public_name: "Linh <script>", avatar_url: null, zalo_phone: "+84901234567", sort_order: 0 };

test("directory cards render safe names, portrait fallback, validated contact and empty state", () => {
  const { ConsultantGrid } = loadTsx("components/consultant/consultant-grid.tsx", ui);
  const html = renderToStaticMarkup(React.createElement(ConsultantGrid, { consultants: [consultant] }));
  assert.match(html, /Linh &lt;script&gt;/);
  assert.match(html, /href="https:\/\/zalo.me\/84901234567"/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /aria-label="Contact Linh &lt;script&gt; on Zalo \(opens in a new tab\)"/);
  assert.doesNotMatch(html, /<img|<script>/);
  const avatar = "https://res.cloudinary.com/aven/image/upload/avatar.jpg";
  const portrait = renderToStaticMarkup(React.createElement(ConsultantGrid, { consultants: [{ ...consultant, avatar_url: avatar, zalo_phone: "bad?redirect=evil" }] }));
  assert.match(portrait, /<img[^>]+alt="Portrait of Linh &lt;script&gt;"/);
  assert.match(portrait, /Zalo contact unavailable/);
  assert.doesNotMatch(portrait, /href="https:\/\/zalo.me/);
  const empty = renderToStaticMarkup(React.createElement(ConsultantGrid, { consultants: [] }));
  assert.match(empty, /No consultants are listed right now/);
  assert.match(empty, /href="\/contact"/);
});

test("public page loads directory at request time and distinguishes empty from query failure without leaking errors", async () => {
  for (const result of [[consultant], [], new Error("secret database error")]) {
    const page = loadTsx("app/consultants/page.tsx", { ...ui, "@/lib/consultants/queries": { readPublicConsultants: async () => { if (result instanceof Error) throw result; return result; } } });
    assert.equal(page.dynamic, "force-dynamic");
    const html = renderToStaticMarkup(await page.default());
    assert.match(html, result instanceof Error ? /directory is temporarily unavailable/ : result.length ? /Chat on Zalo/ : /No consultants are listed/);
    assert.doesNotMatch(html, /secret database error/);
  }
});

test("storefront navigation exposes consultants on desktop and mobile", () => {
  const { Header } = loadTsx("components/layout/header.tsx", { ...ui, "next/navigation": { usePathname: () => "/consultants" }, "@/components/store/store-provider": { useStore: () => ({ cart: [], wishlist: [] }) } });
  const html = renderToStaticMarkup(React.createElement(Header));
  assert.equal((html.match(/href="\/consultants"/g) ?? []).length, 2);
  assert.match(html, /href="\/consultants" class="active"/);
});
