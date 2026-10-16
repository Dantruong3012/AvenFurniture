import { expect, test } from "@playwright/test";
import { chair } from "./fixtures/mock-data";

test("detail shows product content and responsive image markup", async ({ page }) => {
  await page.goto(`/products/${chair.slug}`);
  await expect(page.getByRole("heading", { name: chair.name, level: 1 })).toBeVisible();
  await expect(page.getByText("A carefully proportioned oak chair.")).toBeVisible();
  const image = page.getByRole("img", { name: "Oak lounge chair" });
  await expect(image).toHaveAttribute("srcset", /w=/);
  await expect(image).toHaveAttribute("sizes", /100vw/);
  await expect(page.getByRole("button", { name: "Show image 1" })).toBeVisible();
});
