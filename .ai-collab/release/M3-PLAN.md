# M3 — Browser E2E checks

Status: APPROVED
Planner: Antigravity CLI
Date: 2026-10-16
Planning receipts: `4e4e7a6d-6fd8-4365-9f72-2bec03afb0d5`, `d3fe21c7-1686-48e5-86ed-50608f149427`

## Goal

Use Playwright to test catalog, product detail and images, cart, contact form validation, and unauthenticated admin redirect. Keep application source unchanged.

## Exact ownership

`playwright.config.ts`, `package.json`, `package-lock.json`, `tests/e2e/catalog.spec.ts`, `tests/e2e/product-detail.spec.ts`, `tests/e2e/cart.spec.ts`, `tests/e2e/contact-form.spec.ts`, `tests/e2e/admin-redirect.spec.ts`, `tests/e2e/fixtures/mock-data.ts`, `tests/e2e/fixtures/mock-supabase-fetch.cjs`, `docs/testing-m3-e2e.md`. Lifecycle artifacts M3-PLAN.md, M3-IMPLEMENTATION.md and M3-REVIEW.md are separate.

## Safety and architecture

Local, Preview, and Production use one Supabase project. The deterministic local suite uses a test-only Node preload to intercept the hard-pinned Supabase origin inside the Next process. It requires an explicit test marker, returns fixture data for read-only PostgREST requests, and rejects unknown calls. No application code or live database changes are permitted. Browser form submissions must be intercepted before reaching `/api/inquiries`. Never submit a live inquiry or login against shared Auth.

The current Git Preview is SSO protected. Live Preview testing must require a verified, operator-provided supported protection access method and remain GET/read-only. Missing access is a reported prerequisite, never a skipped test counted as PASS. Do not invent a token or disable protection.

## Acceptance

Local Playwright tests cover catalog filters, product detail and responsive image markup, cart state, contact validation and mocked response, and admin redirect. All tests execute with no skips. Run Playwright, lint, typecheck, node tests, production build, and diff check. Record actual results and limitations. Antigravity reviews exact diff before commit.
