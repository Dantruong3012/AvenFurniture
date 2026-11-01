import { expect, test } from "./fixtures/local-test";

const vietnamese = String.fromCodePoint(...Array.from({ length: 90 }, (_, i) => 0x1ea0 + i)) + " ĂăÂâĐđÊêÔôƠơƯư";

test("bundled fonts render Vietnamese NFC/NFD and all UI weights without platform fallback", async ({ page, context, baseURL, browserName }) => {
  await context.addCookies([{ name: "aven_locale", value: "vi", url: baseURL! }]);
  const fonts: { url: string; status: number }[] = [];
  page.on("response", (response) => { if (response.request().resourceType() === "font") fonts.push({ url: response.url(), status: response.status() }); });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Không gian được thiết kế");
  await page.getByRole("heading", { level: 1 }).evaluate((heading) => { heading.setAttribute("data-font-probe-heading", "true"); });
  const probes = [400, 500, 600, 700];
  await page.evaluate(({ text, weights }) => {
    for (const weight of weights) {
      const probe = document.createElement("p");
      probe.id = `font-probe-${weight}`;
      probe.setAttribute("aria-hidden", "true");
      probe.textContent = text + " " + text.normalize("NFD");
      probe.style.fontWeight = String(weight);
      document.querySelector("main")!.append(probe);
    }
    return document.fonts.ready;
  }, { text: vietnamese, weights: probes });
  expect(fonts.length).toBeGreaterThanOrEqual(2);
  for (const font of fonts) {
    expect(new URL(font.url).origin).toBe(new URL(baseURL!).origin);
    expect(font.url).toContain("/_next/static/");
    expect(font.status).toBe(200);
  }
  if (browserName === "chromium") {
    // Actual rendered glyphs, not document.fonts.check (which permits fallback).
    const cdp = await context.newCDPSession(page);
    await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument");
    for (const selector of ["[data-font-probe-heading]", ...probes.map((weight) => `#font-probe-${weight}`)]) {
      const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
      const { fonts: rendered } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
      const used = rendered.filter((font) => font.glyphCount > 0);
      expect(used, selector).toHaveLength(1);
      expect(used[0].isCustomFont, selector).toBe(true);
      expect(used[0].postScriptName, selector).toMatch(selector === "[data-font-probe-heading]" ? /Lora/ : /BeVietnamPro/);
    }
  }
});

test("Vietnamese hero and header stay readable without clipping or overlapping controls", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "aven_locale", value: "vi", url: baseURL! }]);
  for (const width of [320, 390, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/"); await page.getByRole("heading", { level: 1 }).waitFor(); await page.evaluate(() => document.fonts.ready);
    const metrics = await page.getByRole("heading", { level: 1 }).evaluate((heading) => {
      const heroElement = heading.closest(".hero")!;
      const hero = heroElement.getBoundingClientRect();
      const style = getComputedStyle(heading);
      const title = heading.getBoundingClientRect();
      const cta = heroElement.querySelector(".hero-cta")!.getBoundingClientRect();
      const elements = [...document.querySelectorAll(".header-inner > *, .header-actions > *")]
        .filter((element) => getComputedStyle(element).display !== "none")
        .map((element) => ({ name: element.className, left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right }));
      const menu = document.querySelector(".desktop-nav");
      const navigation = menu && getComputedStyle(menu).display !== "none" ? [...menu.children].map((element) => ({ left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right })) : [];
      return { hero: hero.toJSON(), title: title.toJSON(), cta: cta.toJSON(), elements, navigation, font: parseFloat(style.fontSize), line: parseFloat(style.lineHeight), documentWidth: document.documentElement.scrollWidth, viewport: window.innerWidth };
    });
    expect(metrics.documentWidth, `page width ${width}`).toBeLessThanOrEqual(width);
    expect(metrics.line / metrics.font).toBeGreaterThanOrEqual(1.19);
    expect(metrics.title.top).toBeGreaterThanOrEqual(metrics.hero.top);
    expect(metrics.cta.top).toBeGreaterThan(metrics.title.bottom);
    expect(metrics.cta.bottom).toBeLessThan(metrics.hero.bottom);
    for (const element of [...metrics.elements, ...metrics.navigation]) {
      expect(element.left, `${width}: ${JSON.stringify(element)}`).toBeGreaterThanOrEqual(0);
      expect(element.right, `${width}: ${JSON.stringify(element)}`).toBeLessThanOrEqual(width);
    }
    const brand = metrics.elements.find((item) => item.name === "brand-link")!;
    const actions = metrics.elements.find((item) => item.name === "header-actions")!;
    expect(brand.right).toBeLessThanOrEqual(actions.left);
    if (metrics.navigation.length) {
      expect(metrics.navigation[0].left).toBeGreaterThanOrEqual(brand.right);
      expect(metrics.navigation.at(-1)!.right).toBeLessThanOrEqual(actions.left);
    }
    const selector = page.getByRole("combobox", { name: "Ngôn ngữ", exact: true });
    expect((await selector.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

test("long Vietnamese page headings and admin forms fit narrow screens and enlarged text", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "aven_locale", value: "vi", url: baseURL! }]);
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/products", "/contact", "/admin/login", "/admin/forgot-password"]) {
      await page.goto(route); await page.getByRole("heading", { level: 1 }).waitFor(); await page.evaluate(() => document.fonts.ready);
      // Increasing the base text size models a user's 200% font preference.
      // No responsive clipping is hidden by a global overflow-x rule.
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      const metrics = await page.evaluate(() => {
        const title = document.querySelector("h1")!.getBoundingClientRect();
        return { width: document.documentElement.scrollWidth, viewport: window.innerWidth, titleLeft: title.left, titleRight: title.right, bodyOverflow: getComputedStyle(document.body).overflowX };
      });
      expect(metrics.bodyOverflow).not.toBe("hidden");
      expect(metrics.width, `${route} at ${width}px, enlarged text`).toBeLessThanOrEqual(metrics.viewport);
      expect(metrics.titleLeft).toBeGreaterThanOrEqual(0);
      expect(metrics.titleRight).toBeLessThanOrEqual(width);
    }
  }
});

test("mobile navigation and language control remain usable with keyboard and reduced motion", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "aven_locale", value: "vi", url: baseURL! }]);
  await page.setViewportSize({ width: 390, height: 850 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const menuButton = page.getByRole("button", { name: "Mở trình đơn", exact: true });
  await menuButton.click();
  const navigation = page.getByRole("dialog", { name: "Điều hướng trên di động", exact: true });
  await expect(navigation).toBeVisible();
  const close = navigation.getByRole("button", { name: "Đóng trình đơn", exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(navigation.getByRole("link", { name: "Quản trị", exact: true })).toBeFocused();
  await page.keyboard.press("Tab"); await expect(close).toBeFocused();
  await page.keyboard.press("Escape"); await expect(menuButton).toBeFocused();
  await expect(navigation).toHaveCount(0);
  await menuButton.click();
  await navigation.locator('a[href="/wishlist"]').click();
  await expect(page).toHaveURL(/\/wishlist$/);
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  await expect(navigation).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  await menuButton.click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator(".menu-button")).toHaveAttribute("aria-expanded", "false");
  await expect(navigation).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  const desktopSelector = page.getByRole("combobox", { name: "Ngôn ngữ", exact: true });
  await desktopSelector.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Tìm sản phẩm", exact: true })).toBeFocused();
  await page.setViewportSize({ width: 390, height: 850 });
  await menuButton.click();
  const contact = navigation.getByRole("link", { name: "Liên hệ", exact: true });
  expect((await contact.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await contact.click();
  await expect(page).toHaveURL(/\/contact$/);
  const selector = page.getByRole("combobox", { name: "Ngôn ngữ", exact: true });
  await selector.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
  await expect(selector).toBeFocused();
  const style = await selector.evaluate((element) => ({ outline: getComputedStyle(element).outlineStyle, width: parseFloat(getComputedStyle(element).outlineWidth) }));
  expect(style.outline).toBe("solid"); expect(style.width).toBeGreaterThanOrEqual(2);
  await selector.selectOption("en");
  await expect(page.getByRole("combobox", { name: "Language", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
});
