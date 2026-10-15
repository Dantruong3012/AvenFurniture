// Disposable catalog fixtures; all catalog operations use user sessions + publishable key.
// Secret Key is used ONLY to issue a non-email login proof for the existing test staff.
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
const email = process.env.AVEN_SUPER_ADMIN_EMAIL;
const base = "http://127.0.0.1:3198";
const prefix = `phase1-test-${randomUUID()}`;
let stage = "configuration", superClient, staff, server, browser, adminPage;
const categoryIds = new Set();
const check = (ok) => { if (!ok) throw new Error("Check failed"); };
const ok = (result) => { check(!result.error); return result.data; };
const boundedFetch = (url, options = {}) => fetch(url, { ...options, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) });
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: boundedFetch } };
try {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  check(url === "https://eofdtqnnqgxaoykcbfrv.supabase.co" && key && process.env.SUPABASE_SECRET_KEY && email);
  stage = "password login super admin";
  // Supply only for this process; do not persist in Keychain, .env.local or a file.
  const password = process.env.AVEN_SUPER_ADMIN_TEST_PASSWORD;
  check(Boolean(password));
  superClient = createClient(url, key, options);
  const session = ok(await superClient.auth.signInWithPassword({ email, password }));
  check(session.user.email?.toLowerCase() === email.toLowerCase());
  check(ok(await superClient.rpc("get_admin_session_context")).role === "super_admin");
  const cookies = new Map();
  staff = createServerClient(url, key, { global: { fetch: boundedFetch }, cookies: { getAll: () => [...cookies].map(([name, value]) => ({ name, value })), setAll: (values) => values.forEach(({ name, value }) => value ? cookies.set(name, value) : cookies.delete(name)) } });
  stage = "staff proof login";
  const service = createClient(url, process.env.SUPABASE_SECRET_KEY, options);
  const link = ok(await service.auth.admin.generateLink({ type: "magiclink", email: "staff-test-eofdtqnnqgxaoykcbfrv@example.com" }));
  const staffSession = ok(await staff.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token }));
  check(Boolean(staffSession.user));
  check(ok(await staff.rpc("get_admin_session_context")).role === "staff");
  const anon = createClient(url, key, options);
  stage = "last super admin protections";
  const profiles = ok(await superClient.from("admin_profiles").select("user_id,role,active"));
  check(profiles.filter((p) => p.active && p.role === "super_admin").length === 1);
  for (const mutation of [() => superClient.from("admin_profiles").update({ role: "staff" }).eq("user_id", session.user.id), () => superClient.from("admin_profiles").delete().eq("user_id", session.user.id)]) check((await mutation()).error?.code === "23514");
  stage = "category create/update/delete permissions";
  const category = ok(await superClient.from("categories").insert({ name: prefix, slug: prefix }).select().single()); categoryIds.add(category.id);
  check((await staff.from("categories").insert({ name: prefix, slug: `${prefix}-denied` })).error?.code === "42501");
  check(ok(await staff.from("categories").update({ name: "Denied" }).eq("id", category.id).select()).length === 0);
  check(ok(await staff.from("categories").delete().eq("id", category.id).select()).length === 0);
  check(ok(await staff.from("admin_profiles").update({ role: "super_admin" }).eq("user_id", staffSession.user.id).select()).length === 0);
  ok(await superClient.from("categories").update({ description: "Updated" }).eq("id", category.id).eq("updated_at", category.updated_at).select().single());
  check(ok(await superClient.from("categories").update({ description: "Stale" }).eq("id", category.id).eq("updated_at", category.updated_at).select()).length === 0);
  console.log("PASS: password login, live roles, last-admin guard; super category writes, staff denied, stale category update rejected.");
  const data = { name: prefix, slug: prefix, description: "Verified catalog fixture", category_id: category.id, price: null, currency: "USD", attributes: { material: "Oak" }, featured: true, status: "draft", seo_title: null, seo_description: null };
  const save = (client, id, version, payload, images = []) => client.rpc("save_catalog_product", { p_id: id, p_expected_version: version, p_data: payload, p_asset_ids: images });
  stage = "staff product create and anonymous draft isolation";
  check((await save(anon, null, null, data)).error);
  const productId = ok(await save(staff, null, null, data));
  check(ok(await anon.from("products").select("id").eq("id", productId)).length === 0);
  check((await save(staff, null, null, data)).error?.code === "23505");
  check(["23503", "23001"].includes((await superClient.from("categories").delete().eq("id", category.id)).error?.code));
  stage = "concurrent edits and slug transaction";
  const published = { ...data, slug: `${prefix}-renamed`, status: "published", price: 125.50 };
  const edits = await Promise.all([save(staff, productId, 1, published), save(superClient, productId, 1, published)]);
  console.log("Concurrent edit results:", edits.map((r) => ({ status: r.status, code: /^[A-Z0-9]{5,12}$/.test(r.error?.code ?? "") ? r.error.code : r.error ? "transport-error" : "ok" })));
  check(edits.filter((r) => !r.error).length === 1 && edits.some((r) => r.error?.code === "PT409"));
  stage = "anonymous published visibility";
  check(ok(await anon.from("products").select("id").eq("id", productId)).length === 1);
  check(ok(await staff.from("slug_redirects").select("product_id").eq("old_slug", prefix).single()).product_id === productId);
  stage = "reserved old slug";
  check((await save(staff, null, null, data)).error?.code === "23505");
  stage = "image error rollback";
  check((await save(staff, productId, 2, { ...published, slug: `${prefix}-rollback` }, [randomUUID()])).error);
  check(ok(await staff.from("products").select("version,slug").eq("id", productId).single()).version === 2);
  ok(await superClient.from("categories").update({ active: false }).eq("id", category.id));
  check(ok(await anon.from("products").select("id").eq("id", productId)).length === 0);
  ok(await superClient.from("categories").update({ active: true }).eq("id", category.id));
  ok(await save(staff, productId, 2, { ...published, status: "archived" }));
  check(ok(await anon.from("products").select("id").eq("id", productId)).length === 0);
  check(ok(await staff.from("products").delete().eq("id", productId).eq("version", 2).select()).length === 0);
  ok(await staff.from("products").delete().eq("id", productId).eq("version", 3).select().single());
  check(ok(await staff.from("slug_redirects").select().eq("product_id", productId)).length === 0);
  console.log("PASS: real PostgREST product CRUD, concurrent version conflict, slug reservation, atomic rollback, publish/archive/category visibility, delete cascade.");

  if (!process.env.PLAYWRIGHT_MODULE) throw new Error("Browser runner required");
  stage = "launch production server and isolated browser";
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
  const { expect } = await import(process.env.PLAYWRIGHT_MODULE.replace(/index\.mjs$/, "test.mjs"));
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3198"], { stdio: "ignore" });
  await delay(1500); check(server.exitCode === null);
  browser = await chromium.launch({ executablePath: "/Applications/CocCoc.app/Contents/MacOS/CocCoc", headless: true, args: ["--no-first-run", "--disable-extensions"] });
  const context = await browser.newContext();
  adminPage = await context.newPage(); adminPage.setDefaultTimeout(15000);
  stage = "browser super admin login";
  await adminPage.goto(`${base}/admin/login`);
  await adminPage.locator('input[name="email"]').fill(email); await adminPage.locator('input[name="password"]').fill(password);
  await adminPage.getByRole("button", { name: "Sign in", exact: true }).click(); await adminPage.waitForURL(`${base}/admin`);
  stage = "browser category create";
  await adminPage.goto(`${base}/admin/categories?edit=new`);
  await adminPage.locator('input[name="name"]').fill(`${prefix}-ui`); await adminPage.getByRole("button", { name: "Save changes" }).click();
  await adminPage.waitForURL(/categories\?saved=1/);
  const uiCategory = ok(await superClient.from("categories").select().eq("slug", `${prefix}-ui`).single()); categoryIds.add(uiCategory.id);
  stage = "browser category update";
  await adminPage.goto(`${base}/admin/categories?edit=${uiCategory.id}`);
  await adminPage.locator('textarea[name="description"]').fill("Browser updated category"); await adminPage.getByRole("button", { name: "Save changes" }).click(); await adminPage.waitForURL(/categories\?saved=1/);
  stage = "browser product create and validation";
  await adminPage.goto(`${base}/admin/products?edit=new`);
  await adminPage.locator('input[name="name"]').fill(`${prefix}-ui-product`);
  await adminPage.locator('select[name="category_id"]').selectOption(uiCategory.id);
  await adminPage.locator('.catalog-editor select[name="status"]').selectOption("published");
  stage = "browser invalid publish submit";
  await adminPage.getByRole("button", { name: "Save changes" }).click();
  await adminPage.locator('.catalog-editor [role="alert"]').waitFor();
  stage = "browser validation input retention";
  await delay(200);
  console.log("Validation retention:", { name: await adminPage.locator('input[name="name"]').inputValue() === `${prefix}-ui-product`, category: await adminPage.locator('select[name="category_id"]').inputValue() === uiCategory.id, status: await adminPage.locator('.catalog-editor select[name="status"]').inputValue() === "published" });
  check(await adminPage.locator('input[name="name"]').inputValue() === `${prefix}-ui-product`);
  check(await adminPage.locator('select[name="category_id"]').inputValue() === uiCategory.id);
  check(await adminPage.locator('.catalog-editor select[name="status"]').inputValue() === "published");
  await adminPage.locator('textarea[name="description"]').fill("Browser published product");
  await adminPage.locator('input[name="price"]').fill("99.50");
  stage = "browser valid product save after validation";
  await adminPage.getByRole("button", { name: "Save changes" }).click(); await adminPage.waitForURL(/products\?saved=1/);
  const uiProduct = ok(await superClient.from("products").select().eq("slug", `${prefix}-ui-product`).single());
  stage = "browser product preview/update and duplicate slug error";
  await adminPage.goto(`${base}/admin/products/${uiProduct.id}`); await expect(adminPage.getByRole("heading", { name: uiProduct.name })).toBeVisible({ timeout: 15000 });
  await adminPage.getByRole("link", { name: "Edit product", exact: true }).click();
  await adminPage.locator('input[name="slug"]').fill(`${prefix}-ui-renamed`);
  const cancelDialog = adminPage.waitForEvent("dialog");
  const cancelClick = adminPage.getByRole("link", { name: "Cancel", exact: true }).click();
  await (await cancelDialog).dismiss(); await cancelClick;
  check(await adminPage.locator('input[name="slug"]').inputValue() === `${prefix}-ui-renamed`);
  await adminPage.getByRole("button", { name: "Save changes" }).click(); await adminPage.waitForURL(/products\?saved=1/);
  stage = "browser stale edit conflict";
  await adminPage.goto(`${base}/admin/products?edit=${uiProduct.id}`);
  ok(await staff.from("products").update({ description: "Concurrent change" }).eq("id", uiProduct.id));
  await adminPage.locator('textarea[name="description"]').fill("Stale browser change");
  await adminPage.getByRole("button", { name: "Save changes" }).click();
  await adminPage.getByRole("alert").filter({ hasText: "changed or was deleted" }).waitFor();
  check(await adminPage.locator('textarea[name="description"]').inputValue() === "Stale browser change");
  adminPage.on("dialog", (dialog) => dialog.accept());
  stage = "search, filtering, pagination and mobile navigation";
  ok(await staff.from("products").insert(Array.from({ length: 21 }, (_, index) => ({ name: `${prefix}-page-${String(index).padStart(2, "0")}`, slug: `${prefix}-page-${index}`, category_id: uiCategory.id }))));
  await adminPage.goto(`${base}/admin/products?q=${prefix}-page&sort=name`);
  await expect(adminPage.locator("tbody tr")).toHaveCount(20, { timeout: 15000 }); await adminPage.getByRole("link", { name: "Next", exact: true }).click(); await expect(adminPage.locator("tbody tr")).toHaveCount(1, { timeout: 15000 });
  await adminPage.goto(`${base}/admin/products?status=published&category=${uiCategory.id}`); await expect(adminPage.locator("tbody tr")).toHaveCount(1, { timeout: 15000 });
  for (const width of [360, 390, 768, 1440]) { stage = `browser navigation and overflow at ${width}px`; await adminPage.setViewportSize({ width, height: 900 }); check(await adminPage.locator('.admin-nav').isVisible()); check(await adminPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); }
  stage = "staff browser categories read-only and product edit allowed";
  const staffContext = await browser.newContext();
  await staffContext.addCookies([...cookies].map(([name, value]) => ({ name, value, url: base, sameSite: "Lax" })));
  const staffPage = await staffContext.newPage(); await staffPage.goto(`${base}/admin/categories?edit=new`);
  await expect(staffPage.getByText("Categories are read-only for staff.", { exact: false })).toBeVisible({ timeout: 15000 });
  check(await staffPage.getByRole("button", { name: "Save changes" }).count() === 0);
  await staffPage.goto(`${base}/admin/products?edit=${uiProduct.id}`);
  await staffPage.locator('.catalog-editor select[name="status"]').selectOption("archived"); await staffPage.getByRole("button", { name: "Save changes" }).click(); await staffPage.waitForURL(/products\?saved=1/);
  stage = "browser product delete confirmation";
  await staffPage.goto(`${base}/admin/products?edit=${uiProduct.id}`); await staffPage.getByText("Delete product", { exact: true }).click();
  await staffPage.locator('input[name="confirmed"]').check(); await staffPage.getByRole("button", { name: "Delete permanently" }).click(); await staffPage.waitForURL(/products\?deleted=1/);
  check(ok(await staff.from("products").select("id").eq("id", uiProduct.id)).length === 0);
  ok(await staff.from("products").delete().eq("category_id", uiCategory.id));
  stage = "browser category delete";
  await adminPage.goto(`${base}/admin/categories?edit=${uiCategory.id}`); await adminPage.getByText("Delete category", { exact: true }).click();
  await adminPage.locator('input[name="confirmed"]').check(); await adminPage.getByRole("button", { name: "Delete permanently" }).click(); await adminPage.waitForURL(/categories\?deleted=1/);
  categoryIds.delete(uiCategory.id);
  stage = "anonymous admin route and logout";
  const anonymous = await browser.newContext(); const anonymousPage = await anonymous.newPage();
  await anonymousPage.goto(`${base}/admin/products`); check(new URL(anonymousPage.url()).pathname === "/admin/login");
  await adminPage.getByRole("button", { name: "Sign out", exact: true }).click(); await adminPage.waitForURL(/admin\/login/);
  console.log("PASS: browser super-admin login; category/product CRUD; validation retains input; stale conflict; preview; search/filter/pagination; staff permissions; mobile navigation; logout.");
} catch {
  if (adminPage && process.env.CATALOG_DEBUG_SCREENSHOT && new URL(adminPage.url()).pathname.startsWith("/admin/products")) {
    try { await adminPage.screenshot({ path: process.env.CATALOG_DEBUG_SCREENSHOT, fullPage: true }); } catch { /* no secrets */ }
  }
  console.error(`FAIL: ${stage}. No credentials or response bodies printed.`); process.exitCode = 1;
} finally {
  if (adminPage) { try { await adminPage.goto(`${base}/admin`); const logout = adminPage.getByRole("button", { name: "Sign out", exact: true }); if (await logout.count()) await logout.click(); } catch { /* no secrets */ } }
  await browser?.close(); server?.kill("SIGTERM");
  if (superClient) {
    // Recover IDs even if a UI write committed immediately before a failed assertion.
    try {
      const result = await superClient.from("categories").select("id").in("slug", [prefix, `${prefix}-ui`]);
      if (result.error) throw new Error();
      for (const row of result.data) categoryIds.add(row.id);
      for (const id of categoryIds) {
        ok(await superClient.from("products").delete().eq("category_id", id));
        ok(await superClient.from("categories").delete().eq("id", id));
      }
      console.log("CLEANUP: only this run's catalog fixtures removed; real accounts and existing data retained.");
    } catch { console.error("CLEANUP FAILED: review this run's phase1-test fixtures."); process.exitCode = 1; }
  }
  for (const client of [staff, superClient]) if (client) { try { await client.auth.signOut({ scope: "local" }); } catch { /* no logging */ } }
}
