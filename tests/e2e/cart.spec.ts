import { expect, test } from "@playwright/test";
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
