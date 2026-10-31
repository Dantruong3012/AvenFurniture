import { test as base, expect } from "@playwright/test";

// Keep browser traffic local as well as server-side Supabase requests. The
// optimizer fixture avoids external image availability affecting test timing.
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNVsAAAAASUVORK5CYII=", "base64");
export const test = base.extend({
  page: async ({ page, baseURL }, runFixture) => {
    const origin = new URL(baseURL!).origin;
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort("blockedbyclient");
      if (url.pathname === "/_next/image") return route.fulfill({ status: 200, contentType: "image/png", body: pixel });
      return route.continue();
    });
    await runFixture(page);
  },
});
export { expect };
