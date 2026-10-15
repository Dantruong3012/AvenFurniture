// Read-only live smoke test; never print response bodies, keys or tokens.
import assert from "node:assert/strict";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
let check = "project configuration";
try {
  assert.equal(new URL(url).hostname, "eofdtqnnqgxaoykcbfrv.supabase.co");
  assert.ok(key);
  async function request(path, options = {}) {
    return fetch(new URL(path, url), {
      ...options,
      headers: { apikey: key, "Content-Type": "application/json", ...options.headers },
      signal: AbortSignal.timeout(15000),
    });
  }
  for (const table of ["categories", "products", "media_assets", "product_images", "slug_redirects"]) {
    check = `public read ${table}`;
    const response = await request(`/rest/v1/${table}?select=*&limit=1`);
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(await response.json()));
  }
  for (const table of ["admin_profiles", "consultant_profiles", "inquiries", "inquiry_items", "inquiry_notes", "email_outbox", "audit_logs"]) {
    check = `anonymous denied ${table}`;
    const response = await request(`/rest/v1/${table}?select=*&limit=1`);
    assert.ok([401, 403].includes(response.status));
  }
  check = "public consultant RPC";
  assert.equal((await request("/rest/v1/rpc/list_public_consultants", { method: "POST", body: "{}" })).status, 200);
  check = "anonymous session RPC denied";
  assert.ok([401, 403].includes((await request("/rest/v1/rpc/get_admin_session_context", { method: "POST", body: "{}" })).status));
  check = "malformed JWT rejected";
  assert.equal((await request("/rest/v1/products?select=id&limit=1", { headers: { Authorization: "Bearer invalid.jwt.signature" } })).status, 401);
  console.log("PASS: live PostgREST reads across 12 tables, public/private RPC permissions, malformed JWT rejection. No data changed.");
} catch {
  console.error(`FAIL: ${check}. Response bodies and credentials omitted.`);
  process.exitCode = 1;
}
