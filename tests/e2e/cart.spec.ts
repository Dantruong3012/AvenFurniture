import { expect, test } from "./fixtures/local-test";
import { chair } from "./fixtures/mock-data";

test("cart can add, change quantity, and remove a fixture product", async ({ page }) => {
  await page.goto(`/products/${chair.slug}`);
  await page.getByRole("button", { name: "Add to quote list" }).click();
  await expect(page.locator(".success-notice")).toContainText("added to your quote list");
  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: chair.name })).toBeVisible();
  await page.getByRole("button", { name: "Increase quantity" }).click();
  await expect(page.locator(".cart-line output")).toHaveText("2");
  await page.locator(".cart-line-price button").click();
  await expect(page.getByText("Your quote list is ready for a first piece.")).toBeVisible();
});

test("guest can submit the quote list without checkout or account creation", async ({ page }) => {
  let payload: Record<string, unknown> | undefined;
  await page.route("**/api/inquiries", async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, id: "33333333-3333-4333-8333-333333333333", reference: 84, is_duplicate: false }) });
  });
  await page.goto(`/products/${chair.slug}`);
  await page.getByRole("button", { name: "Add to quote list" }).click();
  await page.goto("/cart");
  await page.getByRole("button", { name: "Request a quote" }).click();
  await page.getByRole("textbox", { name: "Your name" }).fill("Guest Visitor");
  await page.getByRole("textbox", { name: "Phone number" }).fill("0901234567");
  await page.getByRole("button", { name: "Send quote request" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Your reference is #84" })).toBeVisible();
  expect(payload).toMatchObject({ source: "cart", items: [{ productId: chair.id, quantity: 1 }] });
  await expect(page.getByText("Your quote list is ready for a first piece.")).toBeVisible();
  await expect(page.getByText(/checkout|payment/i)).toHaveCount(0);
});
