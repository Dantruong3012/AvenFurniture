import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/catalog/public.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { parseCatalogFilters, formatCatalogPrice } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

test("storefront filters clamp untrusted URL state", () => {
  assert.deepEqual(parseCatalogFilters({ q: "  oak  ", category: "chair", price: "quote", sort: "newest", page: "2" }), { q: "oak", category: "chair", material: "", price: "quote", sort: "newest", page: 2 });
  const invalid = parseCatalogFilters({ category: "bad,id", price: "free", sort: "random", page: "-99" });
  assert.equal(invalid.category, ""); assert.equal(invalid.price, "all"); assert.equal(invalid.sort, "featured"); assert.equal(invalid.page, 1);
});
test("quote-only products never display a fabricated zero price", () => {
  assert.equal(formatCatalogPrice(null, "USD"), "Request a quote");
  assert.notEqual(formatCatalogPrice(0, "USD"), "Request a quote");
});
