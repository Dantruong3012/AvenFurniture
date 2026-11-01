import assert from "node:assert/strict";
import { test } from "node:test";
import { loadModule } from "./helpers/load-module.mjs";

const policy = loadModule("lib/cart/policy.ts");
const ids = Array.from({ length: 105 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);

test("cart policy filters malformed entries, deduplicates and bounds browser input", () => {
  const items = policy.normalizeCartItems([
    { productId: ids[0], quantity: 2 }, { productId: ids[0].toUpperCase(), quantity: 998 },
    { productId: "invalid", quantity: 1 }, { productId: ids[1], quantity: -1 },
    ...ids.slice(2).map((productId) => ({ productId, quantity: 1 })),
  ]);
  assert.equal(items.length, 100);
  assert.deepEqual(items[0], { productId: ids[0], quantity: 999 });
  assert.equal(items.some(({ productId }) => productId === ids[1]), false);
  assert.equal(policy.parseCartSyncRequest({ items: "not-an-array" }), null);
  assert.deepEqual(policy.parseCartSyncRequest({ items: [{ productId: ids[1], quantity: 4 }] }), { items: [{ productId: ids[1], quantity: 4 }] });
});

test("sign-in merge retains server-only items, adds matches and removes unpublished IDs", () => {
  const published = new Set(ids.slice(0, 3));
  assert.deepEqual(policy.mergeCartItems(
    [{ productId: ids[0], quantity: 700 }, { productId: ids[1], quantity: 2 }],
    [{ productId: ids[0], quantity: 500 }, { productId: ids[2], quantity: 3 }, { productId: ids[3], quantity: 9 }],
    published,
  ), [
    { productId: ids[0], quantity: 999 }, { productId: ids[1], quantity: 2 }, { productId: ids[2], quantity: 3 },
  ]);
});

function routeWith(user) {
  const calls = [];
  const route = loadModule("app/api/cart/sync/route.ts", {
    "next/server": { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user }, error: null }) } }) },
    "@/lib/repositories/supabaseCartRepository": {
      listCustomerCartItems: async () => [],
      synchronizeCustomerCart: async (_client, userId, items, mode) => { calls.push({ userId, items, mode }); return items; },
    },
  });
  return { route, calls };
}

test("cart sync route requires a verified authenticated session", async () => {
  assert.equal((await routeWith(null).route.GET()).status, 401);
  assert.equal((await routeWith({ id: ids[0], email_confirmed_at: null }).route.GET()).status, 403);
  const { route, calls } = routeWith({ id: ids[0], email_confirmed_at: "2026-10-01T00:00:00Z" });
  assert.equal((await route.POST(new Request("https://example.test/api/cart/sync", { method: "POST", body: "{" }))).status, 400);
  const response = await route.POST(new Request("https://example.test/api/cart/sync", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: [{ productId: ids[1], quantity: 2 }] }),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ userId: ids[0], items: [{ productId: ids[1], quantity: 2 }], mode: "merge" }]);
});
