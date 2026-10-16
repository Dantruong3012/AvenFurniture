import { expect, test } from "@playwright/test";
import { chair, table } from "./fixtures/mock-data";

test("catalog displays fixture products and filters by name", async ({ page }) => {
  await page.goto("/products");
  await expect(page.getByText("2 pieces")).toBeVisible();
  await expect(page.getByRole("heading", { name: chair.name })).toBeVisible();
  await expect(page.getByRole("heading", { name: table.name })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search products" }).fill("Oak");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/q=Oak/);
  await expect(page.getByText("1 piece")).toBeVisible();
  await expect(page.getByRole("heading", { name: table.name })).toHaveCount(0);
});

test("category filter is reflected in the result", async ({ page }) => {
  await page.goto("/products");
  await page.getByRole("combobox", { name: "Category" }).selectOption("tables");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("1 piece")).toBeVisible();
  await expect(page.getByRole("heading", { name: table.name })).toBeVisible();
});
