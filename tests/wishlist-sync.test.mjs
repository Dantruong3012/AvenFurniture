import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { loadModule } from "./helpers/load-module.mjs";

const policy = loadModule("lib/wishlist/policy.ts");
const ids = Array.from({ length: 105 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);

test("wishlist policy filters malformed IDs, normalizes, deduplicates and bounds browser input", () => {
  const items = policy.normalizeWishlistItems([
    ids[0], ids[0].toUpperCase(), "invalid", 42, ...ids.slice(1),
  ]);
  assert.equal(items.length, 100);
  assert.equal(items[0], ids[0]);
  assert.equal(new Set(items).size, 100);
  assert.equal(policy.parseWishlistSyncRequest({ items: "not-an-array" }), null);
  assert.deepEqual(policy.parseWishlistSyncRequest({ items: [ids[1]] }), { items: [ids[1]] });
});

test("sign-in merge retains account items and appends valid guest items", () => {
  const published = new Set(ids.slice(0, 3));
  assert.deepEqual(policy.mergeWishlistItems(
    [ids[0], ids[1]],
    [ids[1], ids[2], ids[3]],
    published,
  ), [ids[0], ids[1], ids[2]]);
});

function repositoryFixture(initialProductIds, publishedProductIds) {
  const rows = initialProductIds.map((productId, index) => ({
    id: ids[index + 20], user_id: ids[10], product_id: productId, created_at: `2026-10-01T00:00:0${index}Z`,
  }));
  const published = new Set(publishedProductIds);
  const supabase = {
    from(table) {
      let action = "select";
      let values = [];
      const equals = new Map();
      const inclusions = new Map();
      let rowLimit = Infinity;
      const query = {
        select() { action = "select"; return query; },
        eq(column, value) { equals.set(column, value); return query; },
        in(column, items) { inclusions.set(column, items); return query; },
        order() { return query; },
        limit(value) { rowLimit = value; return query; },
        upsert(items) { action = "upsert"; values = items; return query; },
        delete() { action = "delete"; return query; },
        then(resolve, reject) {
          try {
            if (table === "products") {
              const requested = inclusions.get("id") ?? [];
              return Promise.resolve({ data: requested.filter((id) => published.has(id)).map((id) => ({ id })), error: null }).then(resolve, reject);
            }
            if (action === "select") {
              const data = rows.filter((row) => [...equals].every(([key, value]) => row[key] === value)).slice(0, rowLimit);
              return Promise.resolve({ data, error: null }).then(resolve, reject);
            }
            if (action === "upsert") {
              for (const value of values) {
                if (!rows.some((row) => row.user_id === value.user_id && row.product_id === value.product_id)) {
                  rows.push({ id: ids[rows.length + 20], created_at: "2026-10-02T00:00:00Z", ...value });
                }
              }
            } else {
              const products = inclusions.get("product_id") ?? [];
              for (let index = rows.length - 1; index >= 0; index -= 1) {
                if ([...equals].every(([key, value]) => rows[index][key] === value) && products.includes(rows[index].product_id)) rows.splice(index, 1);
              }
            }
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          } catch (error) { return Promise.reject(error).then(resolve, reject); }
        },
      };
      return query;
    },
  };
  return { supabase, rows };
}

test("wishlist repository filters unpublished products and supports merge and replacement", async () => {
  const repository = loadModule("lib/repositories/supabaseWishlistRepository.ts", { "server-only": {} });
  const fixture = repositoryFixture([ids[0], ids[3]], [ids[0], ids[1], ids[2]]);
  assert.deepEqual(await repository.listCustomerWishlistItems(fixture.supabase, ids[10]), [ids[0]]);
  assert.deepEqual(await repository.synchronizeCustomerWishlist(
    fixture.supabase, ids[10], [ids[1], ids[3]], "merge",
  ), [ids[0], ids[1]]);
  assert.deepEqual(fixture.rows.map(({ product_id }) => product_id).sort(), [ids[0], ids[1]].sort());
  assert.deepEqual(await repository.synchronizeCustomerWishlist(
    fixture.supabase, ids[10], [ids[2]], "replace",
  ), [ids[2]]);
  assert.deepEqual(fixture.rows.map(({ product_id }) => product_id), [ids[2]]);
});

function routeWith(user, repository = {}) {
  const calls = [];
  const route = loadModule("app/api/wishlist/sync/route.ts", {
    "next/server": { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user }, error: null }) } }) },
    "@/lib/repositories/supabaseWishlistRepository": {
      listCustomerWishlistItems: repository.list ?? (async () => []),
      synchronizeCustomerWishlist: repository.sync ?? (async (_client, userId, items, mode) => {
        calls.push({ userId, items, mode });
        return items;
      }),
    },
  });
  return { route, calls };
}

test("wishlist sync route requires a verified authenticated session", async () => {
  assert.equal((await routeWith(null).route.GET()).status, 401);
  assert.equal((await routeWith({ id: ids[0], email_confirmed_at: null }).route.GET()).status, 403);
});

test("wishlist sync route validates input and distinguishes merge from replace", async () => {
  const { route, calls } = routeWith({ id: ids[0], email_confirmed_at: "2026-10-01T00:00:00Z" });
  assert.equal((await route.POST(new Request("https://example.test/api/wishlist/sync", { method: "POST", body: "{" }))).status, 400);
  assert.equal((await route.PUT(new Request("https://example.test/api/wishlist/sync", {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: "invalid" }),
  }))).status, 400);
  assert.equal((await route.POST(new Request("https://example.test/api/wishlist/sync", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: [ids[1]] }),
  }))).status, 200);
  assert.equal((await route.PUT(new Request("https://example.test/api/wishlist/sync", {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: [ids[2]] }),
  }))).status, 200);
  assert.deepEqual(calls, [
    { userId: ids[0], items: [ids[1]], mode: "merge" },
    { userId: ids[0], items: [ids[2]], mode: "replace" },
  ]);
});

test("wishlist sync route maps repository failures to a temporary error", async () => {
  const failure = async () => { throw new Error("database unavailable"); };
  const { route } = routeWith(
    { id: ids[0], email_confirmed_at: "2026-10-01T00:00:00Z" },
    { list: failure, sync: failure },
  );
  assert.equal((await route.GET()).status, 503);
  assert.equal((await route.POST(new Request("https://example.test/api/wishlist/sync", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: [] }),
  }))).status, 503);
});

test("wishlist migration extends existing private schema with stable IDs and a server-side bound", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261018010000_customer_wishlist_items.sql", import.meta.url), "utf8");
  assert.match(sql, /alter table public\.customer_wishlist_items[\s\S]*add column id uuid not null default gen_random_uuid\(\)/);
  assert.match(sql, /primary key \(id\)[\s\S]*unique \(user_id, product_id\)/);
  assert.match(sql, /create trigger customer_wishlist_limit before insert/);
  assert.match(sql, /count\(\*\)[\s\S]*>= 100/);
  assert.doesNotMatch(sql, /create table public\.customer_wishlist_items/);
});
