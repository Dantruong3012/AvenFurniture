import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { loadModule } from "./helpers/load-module.mjs";

const summary = {
  total: 7, pending: 2, processing: 1, sent: 3, failed: 1,
  deadLetter: 1, retryBacklog: 2, oldestPendingAgeSeconds: 125, failureRatePercent: 25,
};
const privateDetails = { recipient: "customer@example.com", subject: "Private subject", body: "Private body", headers: { To: "customer@example.com" } };

test("health API checks live admin authorization before reading outbox data", async () => {
  const denied = new Error("redirect:/admin/login");
  let reads = 0;
  const { GET } = loadModule("app/api/admin/outbox/health/route.ts", {
    "@/lib/auth/admin": { requireAdmin: async () => { throw denied; } },
    "@/lib/email/outbox": { getOutboxHealthSummary: async () => { reads++; return summary; } },
  });
  await assert.rejects(GET(), (error) => error === denied);
  assert.equal(reads, 0);
});

test("health API returns only aggregate fields, no private details or mutation methods", async () => {
  const client = {}, calls = [];
  const route = loadModule("app/api/admin/outbox/health/route.ts", {
    "@/lib/auth/admin": { requireAdmin: async () => { calls.push("auth"); return { supabase: client }; } },
    "@/lib/email/outbox": { getOutboxHealthSummary: async (received) => { calls.push(received); return { ...summary, ...privateDetails }; } },
  });
  assert.deepEqual(Object.keys(route), ["GET"]);
  const response = await route.GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(await response.json(), summary);
  assert.deepEqual(calls, ["auth", client]);
});

test("health API hides repository failures and does not cache the error", async () => {
  const { GET } = loadModule("app/api/admin/outbox/health/route.ts", {
    "@/lib/auth/admin": { requireAdmin: async () => ({ supabase: {} }) },
    "@/lib/email/outbox": { getOutboxHealthSummary: async () => { throw new Error("customer@example.com Private body"); } },
  });
  const response = await GET();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(await response.json(), { error: "Outbox health is temporarily unavailable." });
});

const nativeRequire = createRequire(import.meta.url);
function loadTsx(filename, overrides = {}) {
  const source = readFileSync(new URL(`../${filename}`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", code)((name) => name in overrides ? overrides[name] : nativeRequire(name), loaded, loaded.exports);
  return loaded.exports;
}

test("protected dashboard renders only counts and no delivery controls", async () => {
  const calls = [];
  const client = { from(table) {
    calls.push(table);
    const query = {
      select() { return query; }, eq() { return query; }, order() { return query; }, limit() { return query; },
      then(resolve) { return Promise.resolve({ data: [], count: 0, error: null }).then(resolve); },
    };
    return query;
  } };
  const { OutboxHealthCard } = loadTsx("components/admin/outbox-health-card.tsx");
  const page = loadTsx("app/admin/(protected)/page.tsx", {
    "next/link": { default: ({ children, href, ...props }) => React.createElement("a", { href, ...props }, children) },
    "@/lib/auth/admin": { requireAdmin: async () => { calls.push("auth"); return { supabase: client, profile: { display_name: "Admin", role: "staff" } }; } },
    "@/lib/email/outbox": { getOutboxHealthSummary: async (received) => { calls.push("health"); assert.equal(received, client); return summary; } },
    "@/components/admin/outbox-health-card": { OutboxHealthCard },
  }).default;
  const html = renderToStaticMarkup(await page());
  assert.equal(calls[0], "auth");
  assert.ok(calls.includes("health"));
  for (const label of ["Outbox health", "Pending", "Processing", "Sent", "Failed / dead letter", "Due for delivery"]) assert.ok(html.includes(label));
  assert.doesNotMatch(html, /customer@example.com|Private subject|Private body|resend|retry now|<form/i);
  assert.deepEqual(calls.filter((call) => call === "email_outbox"), [], "dashboard uses the aggregate repository boundary");
});

test("protected dashboard checks admin authorization before any dashboard or outbox read", async () => {
  const denied = new Error("redirect:/admin/access-denied");
  const page = loadTsx("app/admin/(protected)/page.tsx", {
    "next/link": { default: () => null },
    "@/lib/auth/admin": { requireAdmin: async () => { throw denied; } },
    "@/lib/email/outbox": { getOutboxHealthSummary: () => assert.fail("unauthorized outbox read") },
    "@/components/admin/outbox-health-card": { OutboxHealthCard: () => null },
  }).default;
  await assert.rejects(page(), (error) => error === denied);
});
