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

test("collection navigation stays scoped and shows the unassociated empty state", async ({ page }) => {
  await page.goto("/collections");
  await page.locator('a[href="/collections?collection=living"]').click();
  await expect(page).toHaveURL(/\/collections\?collection=living/);
  await expect(page.getByRole("heading", { name: "Living" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No pieces in this collection yet" })).toBeVisible();
  await expect(page.getByRole("heading", { name: chair.name })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: table.name })).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search products" }).fill("Oak");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/collection=living/);
  await expect(page).toHaveURL(/q=Oak/);
  await expect(page.getByRole("heading", { name: "No pieces in this collection yet" })).toBeVisible();
});

test("unknown collection shows a recovery link", async ({ page }) => {
  await page.goto("/collections?collection=unknown");
  await expect(page.getByRole("heading", { name: "Collection not found" })).toBeVisible();
  await page.getByRole("link", { name: "Browse collections" }).click();
  await expect(page).toHaveURL(/\/collections$/);
});
