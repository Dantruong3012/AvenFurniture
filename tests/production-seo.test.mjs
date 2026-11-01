import test from "node:test";
import assert from "node:assert/strict";
import { loadModule } from "./helpers/load-module.mjs";

test("Production canonical fallback never defaults to localhost; unsafe configured origins are rejected", () => {
  const saved = Object.fromEntries(["NODE_ENV", "VERCEL_ENV", "NEXT_PUBLIC_SITE_URL"].map(key => [key, process.env[key]]));
  try {
    const { siteOrigin } = loadModule("lib/catalog/site-url.ts");
    delete process.env.NEXT_PUBLIC_SITE_URL; delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = "production";
    assert.equal(siteOrigin(), "https://aven-furniture.vercel.app");
    process.env.NODE_ENV = "development";
    assert.equal(siteOrigin(), "http://localhost:3000");
    process.env.VERCEL_ENV = "production";
    for (const url of ["http://aven-furniture.vercel.app", "https://localhost", "https://127.0.0.1", "https://[::1]"]) {
      process.env.NEXT_PUBLIC_SITE_URL = url;
      assert.throws(siteOrigin, /public HTTPS/);
    }
    process.env.NEXT_PUBLIC_SITE_URL = "https://aven-furniture.vercel.app";
    assert.equal(siteOrigin(), "https://aven-furniture.vercel.app");
    for (const url of ["https://user:password@example.test", "https://example.test?token=private", "javascript:alert(1)"]) {
      process.env.NEXT_PUBLIC_SITE_URL = url;
      assert.throws(siteOrigin, error => !error.message.includes("password") && !error.message.includes("private"));
    }
  } finally { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});

const fixtures = {
  "@/lib/catalog/site-url": { siteOrigin: () => "https://aven-furniture.vercel.app" },
  "@/lib/journal/articles": { listJournalArticles: () => [] },
};
test("sitemap publishes escaped XML only after complete catalog reads", async () => {
  const { GET } = loadModule("app/sitemap.xml/route.ts", { ...fixtures,
    "@/lib/repositories/supabaseProductRepository": {
      listPublicCategories: async () => [{ slug: "chairs" }],
      listSitemapProducts: async () => [{ slug: "oak-chair", updated_at: "2026-10-31T00:00:00Z", product_images: [{ is_primary: true, media_assets: { secure_url: "https://image.example.test/photo?a=1&b=2" } }] }],
    },
  });
  const response = await GET(), text = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/xml/);
  assert.match(text, /\/products\/oak-chair/);
  assert.match(text, /2026-10-31T00:00:00.000Z/);
  assert.match(text, /a=1&amp;b=2/);
  assert.doesNotMatch(text, /localhost/);
});

test("failed sitemap reads return uncached 503 with retry guidance, never a partial successful inventory", async () => {
  for (const failure of ["categories", "products"]) {
    const { GET } = loadModule("app/sitemap.xml/route.ts", { ...fixtures,
      "@/lib/repositories/supabaseProductRepository": {
        listPublicCategories: async () => { if (failure === "categories") throw Error("private database details"); return []; },
        listSitemapProducts: async () => { if (failure === "products") throw Error("private database details"); return []; },
      },
    });
    const response = await GET();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("retry-after"), "60");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.doesNotMatch(await response.text(), /private|<urlset/);
  }
});
