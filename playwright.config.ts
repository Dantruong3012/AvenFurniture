import { defineConfig, devices } from "@playwright/test";

// A remote target needs its own reviewed, read-only suite and verified access.
// Never run the mock-backed local tests against a shared Supabase deployment.
if (process.env.E2E_BASE_URL && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.E2E_BASE_URL)) {
  throw new Error("M3 fixture tests support local origins only; protected Preview checks are not configured.");
}
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3100";
const mockUrl = "https://eofdtqnnqgxaoykcbfrv.supabase.co";
const preload = "--require=./tests/e2e/fixtures/mock-supabase-fetch.cjs";

export default defineConfig({
  testDir: "./tests/e2e",
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  reporter: "list",
  outputDir: "/private/tmp/aven-m3-playwright-results",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run build && npm run start -- -p 3100",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      AVEN_E2E_MOCK: "1",
      NEXT_PUBLIC_SUPABASE_URL: mockUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e_local_fixture_only",
      NODE_OPTIONS: [process.env.NODE_OPTIONS, preload].filter(Boolean).join(" "),
    },
  },
});
