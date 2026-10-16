// Loaded only by the local Playwright webServer. Never use this in a deployment.
if (process.env.AVEN_E2E_MOCK !== "1") {
  throw new Error("The E2E Supabase preload requires AVEN_E2E_MOCK=1.");
}

const origin = "https://eofdtqnnqgxaoykcbfrv.supabase.co";
const categories = [
  { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Chairs", slug: "chairs", active: true },
  { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Tables", slug: "tables", active: true },
];
const now = "2026-01-01T00:00:00.000Z";
const image = (id, alt, photo) => ({
  id, sort_order: 0, is_primary: true,
  media_assets: { id, secure_url: `https://images.unsplash.com/${photo}`, alt, width: 1200, height: 900 },
});
const products = [
  {
    id: "11111111-1111-4111-8111-111111111111", name: "Oak Lounge Chair", slug: "oak-lounge-chair",
    description: "A carefully proportioned oak chair.", price: 850, currency: "USD",
    attributes: { material: "oak" }, featured: true, seo_title: null, seo_description: null,
    created_at: now, updated_at: now, categories: categories[0],
    product_images: [image("11111111-2222-4222-8222-222222222222", "Oak lounge chair", "photo-1503602642458-232111445657")],
  },
  {
    id: "22222222-2222-4222-8222-222222222222", name: "Walnut Dining Table", slug: "walnut-dining-table",
    description: "A dining table in solid walnut.", price: 2300, currency: "USD",
    attributes: { material: "walnut" }, featured: false, seo_title: null, seo_description: null,
    created_at: now, updated_at: now, categories: categories[1],
    product_images: [image("22222222-3333-4333-8333-333333333333", "Walnut dining table", "photo-1499933374294-4584851497cc")],
  },
];

function value(query, name, prefix) {
  const raw = query.get(name);
  return raw?.startsWith(prefix) ? raw.slice(prefix.length) : null;
}
function filteredProducts(query) {
  let rows = products.filter((row) => row.categories.active);
  const slug = value(query, "slug", "eq.");
  const ids = value(query, "id", "in.(");
  const category = value(query, "categories.slug", "eq.");
  const search = value(query, "name", "ilike.");
  const material = value(query, "attributes->>material", "ilike.");
  if (slug) rows = rows.filter((row) => row.slug === slug);
  if (ids) rows = rows.filter((row) => ids.slice(0, -1).split(",").includes(row.id));
  if (category) rows = rows.filter((row) => row.categories.slug === category);
  if (search) rows = rows.filter((row) => row.name.toLowerCase().includes(search.replaceAll("%", "").toLowerCase()));
  if (material) rows = rows.filter((row) => row.attributes.material.includes(material.replaceAll("%", "").toLowerCase()));
  if (query.get("price") === "is.null") rows = rows.filter((row) => row.price === null);
  if (query.get("price") === "not.is.null") rows = rows.filter((row) => row.price !== null);
  const order = query.get("order") || "";
  if (order.startsWith("name.")) rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

const actualFetch = globalThis.fetch;
globalThis.fetch = async function e2eFetch(input, init) {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.origin !== origin) return actualFetch(input, init);
  const method = (init?.method || (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
  if (method !== "GET") throw new Error(`E2E fixture blocked Supabase ${method}.`);
  const path = url.pathname;
  let rows;
  if (path === "/rest/v1/categories") rows = categories.map(({ id, name, slug }) => ({ id, name, slug }));
  else if (path === "/rest/v1/products") rows = filteredProducts(url.searchParams);
  else if (path === "/rest/v1/slug_redirects") rows = [];
  else throw new Error(`E2E fixture has no Supabase handler for ${path}.`);
  const headers = new Headers({ "content-type": "application/json", "content-range": `0-${Math.max(0, rows.length - 1)}/${rows.length}` });
  const accept = new Headers(init?.headers || (typeof input === "object" && "headers" in input ? input.headers : undefined)).get("accept") || "";
  if (accept.includes("application/vnd.pgrst.object+json")) {
    if (rows.length === 0) return new Response(JSON.stringify({ code: "PGRST116", details: "The result contains 0 rows", hint: null, message: "Cannot coerce the result to a single JSON object" }), { status: 406, headers });
    return new Response(JSON.stringify(rows[0]), { status: 200, headers });
  }
  return new Response(JSON.stringify(rows), { status: 200, headers });
};
