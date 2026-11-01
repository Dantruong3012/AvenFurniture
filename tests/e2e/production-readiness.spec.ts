import { expect, test } from "./fixtures/local-test";
import { chair } from "./fixtures/mock-data";

test("sitemap exposes the fixture catalog and valid missing products return 404", async ({ page }) => {
  const sitemap = await page.request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()["content-type"]).toContain("application/xml");
  expect(await sitemap.text()).toContain(`/products/${chair.slug}`);
  const missing = await page.request.get("/products/release-readiness-missing");
  expect(missing.status()).toBe(404);
  expect(await missing.text()).toContain("noindex");
});

test("consultant and customer lookup routes are present without live authentication", async ({ page }) => {
  const response = await page.goto("/consultants");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("main").getByText("Fixture Consultant")).toBeVisible();
  await expect(page.getByRole("link", { name: /Contact Fixture Consultant on Zalo/ })).toHaveAttribute("href", "https://zalo.me/0901234567");
  const portal = await page.goto("/portal");
  expect(portal?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("main").getByRole("status")).toContainText("Sign in to a customer account");
  await expect(page.getByRole("main").getByText("An email or phone match alone does not grant access.", { exact: false })).toBeVisible();
});

test("guest wishlist survives navigation and the storefront fits the viewport", async ({ page }) => {
  await page.goto("/products");
  const save = page.getByRole("button", { name: `Add ${chair.name} to wishlist`, exact: true });
  await save.click();
  await page.goto("/wishlist");
  await expect(page.getByRole("main").getByRole("heading", { name: chair.name })).toBeVisible();
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
  await page.getByRole("button", { name: `Remove ${chair.name} from wishlist`, exact: true }).click();
  await expect(page.getByRole("heading", { name: "A place for pieces you love." })).toBeVisible();
});

test("customer sync APIs reject anonymous reads and malformed catalog identifiers disclose no records", async ({ page }) => {
  for (const path of ["/api/cart/sync", "/api/wishlist/sync"]) {
    const response = await page.request.get(path);
    expect(response.status()).toBe(401);
    expect(await response.text()).not.toContain("sb_secret");
  }
  const response = await page.request.get("/api/catalog/resolve?ids=invalid");
  expect(response.status()).toBe(400);
});
