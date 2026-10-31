# Plan: release-pr-ci

Status: APPROVED
Planner: Codex, delegated by repository owner on 2026-10-31
Dependency: release-pipeline-policy (owner-approved policy in docs/release-policy.md)

The owner approved local implementation and explicitly waived further Antigravity CLI use. This is a documented session exception, not an independent Antigravity approval. Do not run the whole unattended queue or change its receipt gates. Complete and verify the policy artifacts before accepting this task. No email task is in scope.

Implement a pinned GitHub Actions workflow on PRs into main, dev/main pushes and manual re-runs. Six required contexts execute lint, generated Next types plus typecheck, unit/PGlite and runner tests, local mock E2E, production build, and secret/dependency checks. No live credentials or writes. Add a PR template, runtime fixture isolation, precise locators fixing baseline E2E failures, and safe dependency updates for the discovered high/critical advisories. Harden current GitHub check selection against skipped/missing/stale checks, add bounded pagination and sanitized errors. PR reconciliation CLI is added with downstream tracking after CI semantics are tested.

Acceptance: all required local checks pass, original eight E2E failures are fixed without reducing assertions, no secrets enter artifacts, required jobs do not auto-merge/deploy, and missing live branch protection/auth is reported separately from implemented workflow. Existing Next.js bundled docs were read before source changes, and must be re-read where relevant after the dependency update.

Owned paths: .github/workflows/ci.yml, .github/pull_request_template.md, .gitignore, package.json, package-lock.json, scripts/check-release-security.mjs, tests/release-security.test.mjs, tests/supabase-config.test.mjs, tests/e2e/fixtures/local-test.ts, tests/e2e/fixtures/mock-supabase-fetch.cjs, tests/e2e/cart.spec.ts, tests/e2e/catalog.spec.ts, tests/e2e/contact-form.spec.ts, tests/e2e/admin-redirect.spec.ts, tests/e2e/product-detail.spec.ts, playwright.config.ts, lib/github/client.ts, lib/github/status-checks.ts, lib/github/types.ts, tests/github-ci.test.mjs, docs/testing-m3-e2e.md
