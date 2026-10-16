import { expect, test } from "@playwright/test";

test("contact form validates without writing to shared database", async ({ page }) => {
  await page.route("**/api/inquiries", (route) => {
    throw new Error(`Unexpected inquiry request: ${route.request().method()}`);
  });
  await page.goto("/contact");
  await page.getByRole("button", { name: "Send inquiry" }).click();
  await expect(page.locator(".inquiry-error")).toBeVisible();
  await page.getByRole("textbox", { name: "Your name" }).fill("Test Visitor");
  await page.getByRole("textbox", { name: "Phone number" }).fill("0901234567");
  await page.getByRole("textbox", { name: "Email (optional)" }).fill("not-an-email");
  await page.getByRole("button", { name: "Send inquiry" }).click();
  await expect(page.locator(".inquiry-error")).toBeVisible();
});

test("mocked inquiry confirmation does not send a live POST", async ({ page }) => {
  let intercepted = 0;
  await page.route("**/api/inquiries", async (route) => {
    intercepted += 1;
    expect(route.request().method()).toBe("POST");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, id: "33333333-3333-4333-8333-333333333333", reference: 42, is_duplicate: false }) });
  });
  await page.goto("/contact");
  await page.getByRole("textbox", { name: "Your name" }).fill("Test Visitor");
  await page.getByRole("textbox", { name: "Phone number" }).fill("0901234567");
  await page.getByRole("button", { name: "Send inquiry" }).click();
  await expect(page.getByRole("status")).toContainText("Your reference is");
  expect(intercepted).toBe(1);
});
