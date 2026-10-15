// Disposable live integration test. Requires the approved Phase 2 migration, a
// production build, and an active super admin. Auth proofs are created in
// memory by the server Secret Key; no test password or email is persisted.
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const ref = "eofdtqnnqgxaoykcbfrv";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const base = "http://127.0.0.1:3199";
const prefix = `phase2-test-${randomUUID()}`;
const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==", "base64");
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (resource, init = {}) => fetch(resource, { ...init, signal: AbortSignal.timeout(30000) }) } };
let stage = "configuration", server, staff, superAdmin, service, anonymous, categoryId, productId;
const assets = new Map(); // Own Cloudinary public IDs and optional database IDs only.
const leftovers = [];
function check(condition, message) { if (!condition) throw new Error(message); }
function ok(result, label) { if (result.error) throw new Error(`${label}: ${result.error.code || "request failed"}`); return result.data; }
function sessionClient() {
  const cookies = new Map();
  const client = createServerClient(url, key, { global: options.global, cookies: {
    getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
    setAll: (values) => values.forEach(({ name, value }) => value ? cookies.set(name, value) : cookies.delete(name)),
  } });
  return { client, cookies };
}
async function api(session, path, method, body, origin = base) {
  const response = await fetch(base + path, { method, headers: {
    Origin: origin, Cookie: [...session.cookies].map(([name, value]) => `${name}=${value}`).join("; "),
    ...(body === undefined ? {} : { "Content-Type": "application/json" }),
  }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}
async function upload(session) {
  const signed = await api(session, "/api/admin/media/sign", "POST", { name: "phase2-fixture.png", mime: "image/png", bytes: image.length });
  check(signed.status === 200, `Upload sign returned ${signed.status}`);
  const body = new FormData();
  body.set("file", new Blob([image], { type: "image/png" }), "phase2-fixture.png");
  for (const [name, value] of Object.entries(signed.body.params)) body.set(name, value);
  body.set("api_key", signed.body.apiKey);
  body.set("signature", signed.body.signature);
  const response = await fetch(signed.body.uploadUrl, { method: "POST", body, signal: AbortSignal.timeout(30000) });
  check(response.ok, `Cloudinary upload returned ${response.status}`);
  const cloud = await response.json();
  check(typeof cloud.public_id === "string" && cloud.public_id.startsWith("avenfurniture/catalog/"), "Cloudinary returned unexpected asset");
  assets.set(cloud.public_id, null);
  const forged = await api(session, "/api/admin/media/complete", "POST", { upload: { ...cloud, signature: "0".repeat(40) }, alt: "" });
  check(forged.status === 422, "Forged Cloudinary response accepted");
  const completed = await api(session, "/api/admin/media/complete", "POST", { upload: cloud, alt: "" });
  check(completed.status === 201 && completed.body.asset?.public_id === cloud.public_id, `Upload completion returned ${completed.status}`);
  assets.set(cloud.public_id, completed.body.asset.id);
  const retry = await api(session, "/api/admin/media/complete", "POST", { upload: cloud, alt: "" });
  check(retry.status === 200 && retry.body.asset?.id === completed.body.asset.id, "Upload completion was not idempotent");
  return completed.body.asset;
}
async function save(client, id, version, data, ids) {
  return client.rpc("save_catalog_product", { p_id: id, p_expected_version: version, p_data: data, p_asset_ids: ids });
}
async function destroyOrphan(publicId) {
  const params = { invalidate: "true", public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)) };
  const signature = createHash("sha1").update(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => `${name}=${value}`).join("&") + process.env.CLOUDINARY_API_SECRET).digest("hex");
  const body = new URLSearchParams({ ...params, api_key: process.env.CLOUDINARY_API_KEY, signature });
  const response = await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/destroy`, { method: "POST", body, signal: AbortSignal.timeout(30000) });
  const result = await response.json().catch(() => ({}));
  check(response.ok && ["ok", "not found"].includes(result.result), "Cloudinary cleanup unconfirmed");
}

try {
  check(url === `https://${ref}.supabase.co` && key && secretKey, "Missing or incorrect Supabase configuration");
  service = createClient(url, secretKey, options);
  anonymous = createClient(url, key, options);
  // Stop before any fixture writes when the remote schema is not Phase 2.
  const schema = await service.from("media_assets").select("id,status,bytes,uploaded_by").limit(0);
  check(!schema.error, "Phase 2 migration is not applied; no fixture was created");
  check(process.env.PLAYWRIGHT_MODULE, "Missing browser configuration");
  superAdmin = sessionClient();
  staff = sessionClient();
  stage = "test account sign-in";
  const profile = ok(await service.from("admin_profiles").select("user_id").eq("role", "super_admin").eq("active", true).single(), "active super-admin profile");
  const superUser = ok(await service.auth.admin.getUserById(profile.user_id), "super-admin user").user;
  check(Boolean(superUser?.email), "Super-admin email unavailable");
  const superLink = ok(await service.auth.admin.generateLink({ type: "magiclink", email: superUser.email }), "super-admin proof");
  const signedIn = ok(await superAdmin.client.auth.verifyOtp({ type: "magiclink", token_hash: superLink.properties.hashed_token }), "super-admin sign-in");
  check(signedIn.user?.id === profile.user_id, "Unexpected super-admin account");
  check(ok(await superAdmin.client.rpc("get_admin_session_context"), "super-admin role").role === "super_admin", "Super-admin role missing");
  const link = ok(await service.auth.admin.generateLink({ type: "magiclink", email: "staff-test-eofdtqnnqgxaoykcbfrv@example.com" }), "staff proof");
  ok(await staff.client.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token }), "staff sign-in");
  check(ok(await staff.client.rpc("get_admin_session_context"), "staff role").role === "staff", "Staff role missing");
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3199"], { stdio: "ignore" });
  let ready = false;
  for (let i = 0; i < 30; i++) { try { if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {} await delay(300); }
  check(ready && server.exitCode === null, "Production server did not start");
  stage = "media API authorization";
  check((await api({ cookies: new Map() }, "/api/admin/media/sign", "POST", { name: "x.png", mime: "image/png", bytes: image.length })).status === 401, "Anonymous upload was allowed");
  check((await api(staff, "/api/admin/media/sign", "POST", { name: "x.png", mime: "image/png", bytes: image.length }, "https://invalid.example")).status === 403, "Cross-origin upload was allowed");
  stage = "fixture upload";
  const first = await upload(staff);
  const second = await upload(superAdmin);
  const retryAsset = await upload(staff);
  ok(await service.from("media_assets").update({ status: "delete_failed" }).eq("id", retryAsset.id), "simulate interrupted delete on own fixture");
  check((await api(staff, `/api/admin/media/${retryAsset.id}`, "DELETE")).status === 200, "Failed deletion could not be retried");
  assets.delete(retryAsset.public_id);
  const altFirst = await api(staff, `/api/admin/media/${first.id}`, "PATCH", { alt: "Phase 2 test chair front" });
  check(altFirst.status === 200, "Staff could not save alt text");
  const altSecond = await api(superAdmin, `/api/admin/media/${second.id}`, "PATCH", { alt: "Phase 2 test chair side" });
  check(altSecond.status === 200, "Super admin could not save alt text");
  check(ok(await anonymous.from("media_assets").select("id").eq("id", first.id), "hidden media").length === 0, "Unused media leaked publicly");
  stage = "publish and gallery constraints";
  const category = ok(await superAdmin.client.from("categories").insert({ name: prefix, slug: prefix }).select("id").single(), "category create");
  categoryId = category.id;
  const data = { name: `${prefix} chair`, slug: prefix, description: "Phase 2 fixture chair", category_id: categoryId, price: null, currency: "USD", attributes: {}, featured: true, status: "draft", seo_title: null, seo_description: null };
  productId = ok(await save(staff.client, null, null, data, []), "draft create");
  check(ok(await anonymous.from("products").select("id").eq("id", productId), "draft isolation").length === 0, "Draft leaked publicly");
  check((await save(staff.client, productId, 1, { ...data, status: "published" }, [])).error?.code === "23514", "Published without image");
  check((await api(staff, `/api/admin/media/${first.id}`, "PATCH", { alt: "" })).status === 200, "Could not set blank alt on unused media");
  check((await save(staff.client, productId, 1, { ...data, status: "published" }, [first.id])).error?.code === "23514", "Published with blank alt");
  check((await api(staff, `/api/admin/media/${first.id}`, "PATCH", { alt: "Phase 2 test chair front" })).status === 200, "Could not restore alt text");
  ok(await save(staff.client, productId, 1, { ...data, status: "published" }, [first.id, second.id]), "publish");
  check(ok(await anonymous.from("products").select("id").eq("id", productId), "public product").length === 1, "Published product hidden");
  check(ok(await anonymous.from("media_assets").select("id").eq("id", first.id), "public media").length === 1, "Published media hidden");
  const attachedDelete = await api(staff, `/api/admin/media/${first.id}`, "DELETE");
  check(attachedDelete.status === 409, "Attached image was deleted");
  const version = ok(await staff.client.from("products").select("version").eq("id", productId).single(), "product version").version;
  ok(await save(staff.client, productId, version, { ...data, status: "published" }, [second.id, first.id]), "gallery reorder");
  const links = ok(await staff.client.from("product_images").select("asset_id,sort_order,is_primary").eq("product_id", productId).order("sort_order"), "gallery read");
  check(links.length === 2 && links[0].asset_id === second.id && links[0].is_primary && !links[1].is_primary, "Gallery order or primary image incorrect");
  stage = "browser storefront";
  const browserEnv = { ...process.env, PHASE2_BASE_URL: base, PHASE2_EXPECTED_SLUG: prefix, PHASE2_EXPECTED_NAME: data.name, PHASE2_EXPECTED_ID: productId };
  for (const name of ["SUPABASE_SECRET_KEY", "SUPABASE_ACCESS_TOKEN", "CLOUDINARY_API_SECRET"]) delete browserEnv[name];
  const browserTest = spawn(process.execPath, ["scripts/test-phase2-browser.mjs"], { stdio: "inherit", env: browserEnv });
  const browserCode = await new Promise((resolve) => browserTest.on("close", resolve));
  check(browserCode === 0, "Browser storefront verification failed");
  stage = "redirect and public visibility";
  const currentVersion = ok(await staff.client.from("products").select("version").eq("id", productId).single(), "product version").version;
  ok(await save(staff.client, productId, currentVersion, { ...data, status: "published" }, [second.id]), "unlink image");
  check((await api(staff, `/api/admin/media/${first.id}`, "DELETE")).status === 200, "Unlinked image could not be deleted");
  assets.delete(first.public_id);
  const renameVersion = ok(await staff.client.from("products").select("version").eq("id", productId).single(), "product version").version;
  ok(await save(staff.client, productId, renameVersion, { ...data, slug: `${prefix}-renamed`, status: "published" }, [second.id]), "product rename");
  const oldUrl = await fetch(`${base}/products/${prefix}`, { redirect: "manual", signal: AbortSignal.timeout(30000) });
  check(oldUrl.status === 308 && oldUrl.headers.get("location")?.endsWith(`/products/${prefix}-renamed`), "Old slug did not redirect with 308");
  ok(await superAdmin.client.from("categories").update({ active: false }).eq("id", categoryId), "deactivate category");
  check((await fetch(`${base}/products/${prefix}-renamed`, { signal: AbortSignal.timeout(30000) })).status === 404, "Inactive category leaked product");
  ok(await superAdmin.client.from("categories").update({ active: true }).eq("id", categoryId), "reactivate category");
  const finalVersion = ok(await staff.client.from("products").select("version").eq("id", productId).single(), "product version").version;
  ok(await save(staff.client, productId, finalVersion, { ...data, slug: `${prefix}-renamed`, status: "archived" }, [second.id]), "archive");
  check((await fetch(`${base}/products/${prefix}-renamed`, { signal: AbortSignal.timeout(30000) })).status === 404, "Archived product leaked");
  const resolved = await fetch(`${base}/api/catalog/resolve?ids=${productId}`, { signal: AbortSignal.timeout(30000) });
  check(resolved.ok && (await resolved.json()).products.length === 0, "Archived cart product still resolved");
  const hiddenBrowserEnv = { ...browserEnv, PHASE2_HIDDEN_ID: productId };
  for (const name of ["PHASE2_EXPECTED_SLUG", "PHASE2_EXPECTED_NAME", "PHASE2_EXPECTED_ID"]) delete hiddenBrowserEnv[name];
  const hiddenBrowser = spawn(process.execPath, ["scripts/test-phase2-browser.mjs"], { stdio: "inherit", env: hiddenBrowserEnv });
  check(await new Promise((resolve) => hiddenBrowser.on("close", resolve)) === 0, "Archived cart and wishlist browser verification failed");
  console.log("PASS: live Cloudinary upload, API guards, gallery, publish, browser storefront, redirect and visibility.");
} catch (error) {
  console.error(`FAIL: ${stage}. ${error instanceof Error ? error.message : "Unknown error"}. No credentials or response bodies printed.`);
  process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) { server.kill("SIGTERM"); await delay(300); if (server.exitCode === null) server.kill("SIGKILL"); }
  // Remove only records and Cloudinary assets created by this run.
  if (service) {
    if (productId) { const result = await service.from("products").delete().eq("id", productId); if (result.error) leftovers.push(`product ${productId}`); }
    if (categoryId) { const result = await service.from("categories").delete().eq("id", categoryId); if (result.error) leftovers.push(`category ${categoryId}`); }
    for (const [publicId, assetId] of assets) {
      try {
        if (assetId) {
          const links = ok(await service.from("product_images").select("id").eq("asset_id", assetId).limit(1), "media cleanup check");
          check(links.length === 0, "Media still attached");
        }
        await destroyOrphan(publicId);
        if (assetId) ok(await service.from("media_assets").delete().eq("id", assetId), "media cleanup");
      } catch { leftovers.push(`media ${publicId}`); }
    }
  }
  for (const session of [staff, superAdmin]) if (session) try { await session.client.auth.signOut({ scope: "local" }); } catch {}
  if (leftovers.length) { console.error(`CLEANUP INCOMPLETE: ${leftovers.join(", ")}`); process.exitCode = 1; }
  else if (assets.size || productId || categoryId) console.log("CLEANUP: this run's product, category and Cloudinary images removed.");
}
