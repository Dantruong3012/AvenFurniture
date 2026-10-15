import assert from "node:assert/strict";
import { test } from "node:test";
import { loadModule } from "./helpers/load-module.mjs";
const { validateCatalog, suggestSlug, catalogError } = loadModule("lib/validation/catalog.ts");
const id = "00000000-0000-0000-0000-000000000001";
const form = (overrides = {}) => {
  const values = { id: "", name: "Bàn gỗ đẹp", slug: "", description: "Oak table", category_id: id, price: "", currency: "USD", status: "draft", attributes: "{}", sort_order: "0", ...overrides };
  const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data;
};
test("catalog validation enforces limits, exact decimal format, UUID, enum and publish rules", () => {
  assert.equal(suggestSlug("  Bàn Gỗ Đẹp  "), "ban-go-dep");
  const valid = validateCatalog("products", form());
  assert.deepEqual(valid.fields, {}); assert.equal(valid.data.price, null);
  for (const price of ["-1", "NaN", "Infinity", "1e3", "1.234", "10000000000"]) assert.ok(validateCatalog("products", form({ price })).fields.price);
  assert.equal(validateCatalog("products", form({ price: "9999999999.99" })).data.price, 9999999999.99);
  for (const [key, value] of Object.entries({ category_id: "invalid", status: "active", attributes: "[]", currency: "US", slug: "bad/slug", name: " ", seo_title: "x".repeat(201) })) assert.ok(validateCatalog("products", form({ [key]: value })).fields[key], key);
  assert.ok(validateCatalog("products", form({ status: "published", description: " " })).fields.description);
  assert.ok(validateCatalog("categories", form({ sort_order: "1.5" })).fields.sort_order);
  assert.ok(validateCatalog("categories", form({ sort_order: "2147483648" })).fields.sort_order);
  assert.equal(validateCatalog("products", form({ role: "super_admin", version: "999" })).data.role, undefined);
  assert.equal(catalogError("unknown-secret-error" ).includes("unknown-secret"), false);
});
test("catalog filters clamp pagination, reject untrusted enums and preserve literal search", () => {
  const { catalogFilters } = loadModule("lib/catalog/queries.ts", { "server-only": {}, "@/lib/auth/admin": {} });
  const filters = catalogFilters({ page: "-99", status: "private", category: "injection", sort: "name.desc", q: "_%", edit: ["new"] }, "products");
  assert.equal(filters.page, 1); assert.equal(filters.status, ""); assert.equal(filters.category, ""); assert.equal(filters.sort, "newest"); assert.equal(filters.q, "_%"); assert.equal(filters.edit, "");
});
function actions({ role = "staff", allow = true, rpcError = null } = {}) {
  const calls = [], invalidated = [];
  const supabase = { rpc: async (name, args) => { calls.push({ name, args }); return { error: rpcError, data: id }; } };
  const loaded = loadModule("lib/catalog/actions.ts", {
    "@/lib/auth/admin": { requireAdmin: async (required) => { if (required && required !== role) throw new Error("access-denied"); return { user: { id }, supabase }; } },
    "@/lib/auth/mutation": { allowAuthMutation: async () => allow },
    "next/cache": { revalidatePath: (...args) => invalidated.push(args) },
    "next/navigation": { redirect: (url) => { throw new Error(`redirect:${url}`); } },
  });
  return { ...loaded, calls, invalidated };
}
test("Server Actions enforce role and origin before any catalog writes", async () => {
  const a = actions();
  await assert.rejects(a.saveCategory({}, form()), /access-denied/);
  await assert.rejects(a.deleteCatalog({}, form({ kind: "categories", id, confirmed: "on" })), /access-denied/);
  assert.equal(a.calls.length, 0);
  const denied = actions({ allow: false });
  assert.ok((await denied.saveProduct({}, form())).error); assert.equal(denied.calls.length, 0);
});
test("product action validates server input, uses caller RPC, preserves conflicts and invalidates only success", async () => {
  const a = actions();
  assert.ok((await a.saveProduct({}, form({ price: "-4" }))).fields.price); assert.equal(a.calls.length, 0);
  assert.ok((await a.saveProduct({}, form({ id, version: "0" }))).error); assert.equal(a.calls.length, 0);
  assert.ok((await a.saveProduct({}, form({ asset_ids: `${id},${id}` }))).error); assert.equal(a.calls.length, 0);
  await assert.rejects(a.saveProduct({}, form()), /redirect:\/admin\/products\?saved=1/);
  assert.equal(a.calls[0].name, "save_catalog_product"); assert.equal(a.calls[0].args.p_id, null); assert.equal(a.invalidated.length, 1);
  const conflict = actions({ rpcError: { code: "40001", message: "sensitive database text" } });
  const result = await conflict.saveProduct({}, form({ id, version: "1", name: "Keep my input" }));
  assert.equal(result.values.name, "Keep my input"); assert.match(result.error, /changed or was deleted/); assert.doesNotMatch(result.error, /sensitive/); assert.equal(conflict.invalidated.length, 0);
});
