// Browser smoke test. PHASE2_EXPECTED_* enables checks against a disposable live fixture.
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

if (!process.env.PLAYWRIGHT_MODULE) throw new Error("PLAYWRIGHT_MODULE is required.");
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const base = process.env.PHASE2_BASE_URL || "http://127.0.0.1:3199";
const expectedSlug = process.env.PHASE2_EXPECTED_SLUG;
const expectedName = process.env.PHASE2_EXPECTED_NAME;
const expectedId = process.env.PHASE2_EXPECTED_ID;
const hiddenId = process.env.PHASE2_HIDDEN_ID;
let server, browser;
try {
  if (!process.env.PHASE2_BASE_URL) server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3199"], { stdio: "ignore" });
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try { const response = await fetch(base); if (response.ok) { ready = true; break; } } catch {}
    await delay(300);
  }
  if (!ready) throw new Error("Production server did not start.");
  browser = await chromium.launch({ executablePath: "/Applications/CocCoc.app/Contents/MacOS/CocCoc", headless: true, args: ["--no-first-run", "--disable-extensions"] });
  if (hiddenId) {
    const page = await browser.newPage();
    await page.goto(base);
    await page.evaluate((id) => {
      localStorage.setItem("aven-furniture-cart-v1", JSON.stringify([{ productId: id, quantity: 2 }]));
      localStorage.setItem("aven-furniture-wishlist-v1", JSON.stringify([id]));
    }, hiddenId);
    await page.goto(`${base}/cart`);
    await page.getByText("Product unavailable", { exact: true }).waitFor();
    await page.reload();
    await page.getByText("Product unavailable", { exact: true }).waitFor();
    await page.goto(`${base}/wishlist`);
    await page.getByText("This saved product is no longer available.", { exact: true }).waitFor();
    console.log("PASS: hidden product stays unavailable in persisted quote list and wishlist.");
  } else {
    for (const width of [360, 390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const response = await page.goto(`${base}/products`, { waitUntil: "networkidle" });
      if (response?.status() !== 200) throw new Error(`Catalog HTTP error at ${width}px.`);
      if (expectedSlug) {
        const filtered = await page.goto(`${base}/products?q=${encodeURIComponent(expectedName)}`, { waitUntil: "networkidle" });
        if (filtered?.status() !== 200) throw new Error(`Filtered catalog returned HTTP ${filtered?.status()}.`);
        await page.locator(".product-card").first().waitFor({ timeout: 15000 });
        if (!(await page.locator(".product-card").first().innerText()).includes(expectedName)) throw new Error("Published fixture missing from filtered catalog.");
      } else if ((await page.locator(".product-card").count()) === 0 && !(await page.getByRole("heading", { name: "No pieces found" }).isVisible())) throw new Error("Empty state missing.");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (overflow) throw new Error(`Horizontal overflow at ${width}px.`);
      await context.close();
    }
    const page = await browser.newPage();
    if ((await page.goto(`${base}/products/nonexistent-phase2-slug`))?.status() !== 404) throw new Error("Missing product did not return HTTP 404.");
    if (expectedSlug) {
      if (!expectedName || !expectedId) throw new Error("Fixture name and ID are required.");
      const response = await page.goto(`${base}/products/${expectedSlug}`, { waitUntil: "networkidle" });
      if (response?.status() !== 200) throw new Error("Published fixture detail returned an error.");
      await page.getByRole("heading", { name: expectedName }).waitFor();
      if (!(await page.getByText("Request a quote", { exact: true }).isVisible())) throw new Error("Quote-only price missing.");
      if (!(await page.locator('meta[property="og:title"]').getAttribute("content"))?.includes(expectedName)) throw new Error("Fixture OG metadata missing.");
      const sitemap = await (await page.request.get(`${base}/sitemap.xml`)).text();
      if (!sitemap.includes(`/products/${expectedSlug}`)) throw new Error("Published fixture missing from sitemap.");
      await page.getByRole("button", { name: "Add to wishlist" }).click();
      await page.waitForFunction((id) => JSON.parse(localStorage.getItem("aven-furniture-wishlist-v1") || "[]").includes(id), expectedId);
      await page.reload();
      await page.getByRole("button", { name: "Remove from wishlist" }).waitFor();
      await page.getByRole("button", { name: /Add to quote list/i }).click();
      await page.waitForFunction((id) => JSON.parse(localStorage.getItem("aven-furniture-cart-v1") || "[]").some((item) => item.productId === id), expectedId);
      await page.goto(`${base}/cart`);
      await page.reload();
      await page.getByRole("heading", { name: expectedName }).waitFor({ timeout: 15000 });
      await page.keyboard.press("Tab");
      if (!(await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement !== document.body))) throw new Error("Keyboard focus missing.");
    }
    await page.goto(`${base}/cart`);
    if (await page.getByText("Continue to demo checkout").count()) throw new Error("Demo checkout remains visible.");
    await page.goto(`${base}/contact?source=quote`);
    await page.getByText("Online inquiries will be available in the next phase.", { exact: false }).waitFor({ timeout: 15000 });
    console.log(`PASS: ${expectedSlug ? "published fixture, sitemap, metadata, wishlist and quote persistence" : "catalog state"}, HTTP 404, quote/contact honesty and 360/390/768/1440px overflow checks.`);
  }
} finally {
  await browser?.close();
  if (server && server.exitCode === null) { server.kill("SIGTERM"); await delay(300); if (server.exitCode === null) server.kill("SIGKILL"); }
}
