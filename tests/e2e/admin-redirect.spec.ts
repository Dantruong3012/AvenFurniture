import { expect, test } from "./fixtures/local-test";

test("unauthenticated admin route redirects to login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
});
