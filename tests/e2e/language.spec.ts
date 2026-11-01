import { expect, test } from "./fixtures/local-test";
import { chair } from "./fixtures/mock-data";

test("language switching preserves URL, contact draft and translated validation without a write", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && /hydration|didn't match|did not match/i.test(message.text())) errors.push(message.text()); });
  let submissions = 0;
  await page.route("**/api/inquiries", async (route) => { submissions++; await route.abort(); });
  await page.goto("/contact?source=quote#main-content");
  await page.getByRole("textbox", { name: "Your name", exact: true }).fill("Draft Visitor");
  const url = page.url();
  await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("vi");
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  await expect(page.getByRole("combobox", { name: "Ngôn ngữ", exact: true })).toBeEnabled();
  await expect(page.getByRole("textbox", { name: "Tên của bạn", exact: true })).toHaveValue("Draft Visitor");
  await expect(page.getByRole("heading", { name: "Danh sách báo giá của bạn", exact: true })).toBeVisible();
  expect(page.url()).toBe(url);
  await page.getByRole("button", { name: "Gửi yêu cầu tư vấn", exact: true }).click();
  await expect(page.locator(".inquiry-error")).toContainText("Kiểm tra thông tin yêu cầu và thử lại.");
  await expect(page.locator(".inquiry-field-error").first()).toContainText("Nhập");
  expect(submissions).toBe(0);
  const cookie = (await context.cookies()).find((item) => item.name === "aven_locale");
  expect(cookie).toMatchObject({ value: "vi", path: "/", sameSite: "Lax" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  await expect(page.getByRole("button", { name: "Gửi yêu cầu tư vấn", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("locale persists through product and cart navigation without changing product data or quantity", async ({ page }) => {
  await page.goto(`/products/${chair.slug}`);
  await page.getByRole("button", { name: "Add to quote list", exact: true }).click();
  await page.goto("/cart");
  await page.getByRole("button", { name: "Increase quantity", exact: true }).click();
  await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("vi");
  await expect(page.getByRole("combobox", { name: "Ngôn ngữ", exact: true })).toBeEnabled();
  await expect(page.getByRole("heading", { name: chair.name, exact: true })).toBeVisible();
  await expect(page.locator(".cart-line output")).toHaveText("2");
  await page.reload();
  await expect(page.locator(".cart-line output")).toHaveText("2");
  await page.getByRole("link", { name: chair.name, exact: true }).click();
  await expect(page.getByRole("button", { name: "Thêm vào danh sách báo giá", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: chair.name, exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Ngôn ngữ", exact: true }).selectOption("en");
  await expect(page.getByRole("button", { name: "Add to quote list", exact: true })).toBeVisible();
});

test("admin and password screens translate while preserving typed credentials without submitting", async ({ page }) => {
  let writes = 0;
  page.on("request", (request) => { if (request.method() !== "GET" && request.method() !== "HEAD") writes++; });
  await page.goto("/admin/login");
  await page.getByLabel("Email", { exact: true }).fill("fixture@example.test");
  await page.getByLabel("Password", { exact: true }).fill("fixture-password-not-submitted");
  await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("vi");
  await expect(page.getByRole("heading", { name: "Chào mừng trở lại.", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Ngôn ngữ", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("fixture@example.test");
  await expect(page.getByLabel("Mật khẩu", { exact: true })).toHaveValue("fixture-password-not-submitted");
  await expect(page.getByRole("button", { name: "Đăng nhập", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Quên mật khẩu?", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Đặt lại mật khẩu", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Ngôn ngữ", exact: true })).toHaveValue("vi");
  expect(writes).toBe(0);
});

test("server-rendered HTML uses the locale cookie without executing JavaScript and rejects unsupported values", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    await context.addCookies([{ name: "aven_locale", value: "vi", url: baseURL! }]);
    // Next streams Suspense content behind a loading boundary, which needs its
    // reveal script. Inspect actual HTML rather than claiming no-JS navigation.
    const response = await context.request.get(baseURL! + "/products");
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toMatch(/<html\b[^>]*\blang="vi"[^>]*>/);
    expect(html).toContain('<h1>Nội thất cho<br/>cuộc sống tinh tế</h1>');
    expect(html).toContain('<title>Sản phẩm | AvenFurniture</title>');
    expect(html).toContain('aria-label="Ngôn ngữ"');
    await context.addCookies([{ name: "aven_locale", value: "unsupported", url: baseURL! }]);
    const english = await context.request.get(baseURL! + "/products");
    expect(english.status()).toBe(200);
    const englishHtml = await english.text();
    expect(englishHtml).toMatch(/<html\b[^>]*\blang="en"[^>]*>/);
    expect(englishHtml).toContain('<h1>Furniture for<br/>considered living</h1>');
  } finally { await context.close(); }
});

test("Vietnamese layout and selector fit desktop and narrow mobile screens", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "aven_locale", value: "vi", url: baseURL! }]);
  for (const width of [1440, 1280, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 850 });
    for (const path of ["/products", "/admin/login"]) {
      await page.goto(path);
      await expect(page.getByRole("combobox", { name: "Ngôn ngữ", exact: true })).toBeVisible();
      const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
      expect(dimensions.content, `${path} at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
    }
  }
});
