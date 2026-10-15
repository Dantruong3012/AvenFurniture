// Read-only browser smoke test. Requires PLAYWRIGHT_MODULE installed in a disposable directory.
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

if (!process.env.PLAYWRIGHT_MODULE) throw new Error("PLAYWRIGHT_MODULE is required.");
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const base = "http://127.0.0.1:3199";
let server, browser;
try {
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3199"], { stdio: "ignore" });
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try { const response = await fetch(base); if (response.ok) { ready = true; break; } } catch {}
    await delay(300);
  }
  if (!ready) throw new Error("Production server did not start.");
  browser = await chromium.launch({ executablePath: "/Applications/CocCoc.app/Contents/MacOS/CocCoc", headless: true, args: ["--no-first-run", "--disable-extensions"] });
  for (const width of [360, 390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const response = await page.goto(`${base}/products`, { waitUntil: "networkidle" });
    if (response?.status() !== 200) throw new Error(`Catalog HTTP error at ${width}px.`);
    if (await page.locator(".product-card").count() !== 0) throw new Error("Demo products remain visible.");
    if (!(await page.getByRole("heading", { name: "No pieces found" }).isVisible())) throw new Error("Empty state missing.");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) throw new Error(`Horizontal overflow at ${width}px.`);
    await context.close();
  }
  const page = await browser.newPage();
  if ((await page.goto(`${base}/products/nonexistent-phase2-slug`))?.status() !== 404) throw new Error("Missing product did not return HTTP 404.");
  await page.goto(`${base}/cart`);
  if (await page.getByText("Continue to demo checkout").count()) throw new Error("Demo checkout remains visible.");
  await page.goto(`${base}/contact?source=quote`);
  if (!(await page.getByText("Online inquiries will be available in the next phase.", { exact: false }).isVisible())) throw new Error("Contact does not explain inquiry availability.");
  console.log("PASS: empty catalog, HTTP 404, quote/contact honesty and 360/390/768/1440px overflow checks.");
} finally {
  await browser?.close();
  if (server && server.exitCode === null) { server.kill("SIGTERM"); await delay(300); if (server.exitCode === null) server.kill("SIGKILL"); }
}
