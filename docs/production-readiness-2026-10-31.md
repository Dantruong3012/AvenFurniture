# Production readiness — 2026-10-31

Auditor: Codex. Overall result: **NOT READY**. This is read-only infrastructure evidence plus local fixture verification. No Production deployment, migration, restore, Auth/RLS/environment/domain/billing change, remote merge or push occurred.

## Actual source and deployment

| Item | Verified value |
| --- | --- |
| GitHub repository | Dantruong3012/AvenFurniture, public, default branch main |
| Audited dev/remote HEAD before local work | 8a267eeb7cff6a7246927c444d7466c10f35d181 |
| Remote main | 7454ca2eacb6185ca3611159d80c0aadf1cd9cd1 |
| Production deployment | dpl_9whkyD1hL2HYVsxuyR2zNXvjR1Ge, READY / PROMOTED |
| Production full Git SHA | 7454ca2eacb6185ca3611159d80c0aadf1cd9cd1, branch main |
| Actual Production alias | aven-furniture.vercel.app → dpl_9whkyD1hL2HYVsxuyR2zNXvjR1Ge |
| Preview deployment | dpl_8MzUqeA1hSx9d9QPowTfqyHf48Fg, READY / STAGED |
| Preview full Git SHA | 8a267eeb7cff6a7246927c444d7466c10f35d181, dev/aven-autonomous-backlog |
| Vercel project/team | prj_PyRDr0N6RUnKTeKWaum17vWfkmkY / team_TNVd8B1HyqiU94SchwMOUvBO |
| Vercel Git link | GitHub, Production Branch main, autoAssignCustomDomains true |

Vercel MCP returned 403 for the explicit team. The existing protected CLI/API credential successfully read project, deployment detail, alias and env metadata; no env values were decrypted or logged. These reads establish the serving SHA, not a new deployment by this session. The dev branch was 104 commits ahead of main at audit time; new local Release commits are also not deployed. Merging main must be treated as potential Production impact. Preserve the current deployment identity as a potential rollback candidate, but it is **not yet a validated healthy rollback target** because the database and some endpoints are failing.

## Release gates

The owner approved the Release policy and explicitly delegated local decisions to Codex without further Antigravity CLI calls. That session exception is recorded in task artifacts. No independent review is claimed. The legacy orchestrator, lock and receipt gates remain intact; release config stays disabled/manual. All four deferred Email tasks retain their original backlog rows and have no implementation changes.

Fresh public GitHub reads found main/dev unprotected, no repository rulesets, zero Actions workflows and no open PR. The protection endpoint required authentication. No supported GitHub API token or gh executable was available. A GitHub plugin connection has been suggested; its installation/authentication is not claimed. Local workflow/preflight code is implemented, but remote enforcement and CI execution are not verified. Independent human reviewer assignment is pending. These are unresolved acceptance criteria, so downstream Release tasks remain BLOCKED rather than DONE.

## Database, authentication and authorization

Supabase Management API returned `status: INACTIVE` for `eofdtqnnqgxaoykcbfrv`. The read-only SELECT endpoint returned HTTP 400, “Database is possibly not accessible at the moment”; migration-history GET returned HTTP 544 connection timeout. The project API hostname did not resolve from the authorized external-network check. **No restore/resume was requested.** This is consistent with the observed data-route failures, but runtime logs have not established an exclusive cause.

Fresh live migration history, RLS grants/policies, RPC presence, Auth configuration and schema parity remain **UNVERIFIED**. The historical 2026-10-16 audit reported five applied migrations and a missing inquiry RPC. That historical result is not current proof of which migrations are still pending. Review all local migrations against fresh live history after an approved restore, including inquiry transaction, event schema, staff Auth/invite/role/deletion, newsletter/customer identity and cart/wishlist changes. Do not apply migrations automatically. Some alter sensitive Auth/RLS and require explicit approval, database backup/restore evidence, staged verification and an application compatibility/forward-fix plan. Do not activate email delivery while reviewing schema dependencies.

Local disposable PGlite tests exercise the real SQL and authorization/RLS model, including anonymous/private boundaries, cross-user cart access, staff safeguards and transactional inquiry rollback/deduplication. Mocked service/API tests cover role checks, authentication, validation and sanitized failure responses. They do not prove the inactive live database has those migrations or policies. No live login, signup, inquiry submission, upload or data mutation was attempted. The in-process auth attempt limiter explicitly is not a distributed Production rate limiter; verify platform/Supabase rate limits and monitoring before approval.

## Environment and secrets

Local env audit passed public config/project validation, .env mode 600/ignored/untracked, empty example and no configured secrets in tracked/client bundles. It failed local presence checks for `SUPABASE_SECRET_KEY`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. Do not fix this by copying Production credentials into the repository or CI.

Vercel metadata shows both public Supabase variables target Production and Preview. Supabase secret and three Cloudinary variables target Production only and are sensitive; their actual values/validity were not read or validated. Preview lacks the privileged server keys for mutation features; current local E2E uses mocked inquiry responses and does not establish live server-write capability. `NEXT_PUBLIC_SITE_URL` was absent from returned project env metadata. Verify the desired canonical URL and inherited/system configuration; if a Production env change is needed, approve it separately and rebuild explicitly. Do not silently expand any secret's target.

Dependency audit initially reported Next critical vulnerabilities and a transitive zod high advisory. Local Next/eslint-config-next were updated to 16.4.3 and compatible zod was updated. The final high/critical gate passed with 16 moderate findings retained for triage. Production still runs its older source/package revision. [Next advisory](https://github.com/advisories/GHSA-2464-fhr4-w9xw) and [App Router advisory](https://github.com/advisories/GHSA-673q-mjm6-r5xr) document the patched range; an audit match is not evidence of exploitation or proof every vulnerable feature is in use.

## Read-only HTTP observations

| Production path | HTTP status |
| --- | --- |
| /, /products, /cart, /contact, /admin/login | 200 |
| /consultants, /portal | 404 (routes exist in newer dev source) |
| /sitemap.xml | 500 |
| /products/release-readiness-missing-20261031 | 503 (expected eventual nonexistent-product behavior is 404) |

Observed responses included `nosniff` and frame DENY. The limited HTML scan did not find RSC digest errors, but status failures remain failures. A 200 does not prove data availability. All nine Preview GETs redirected to Vercel SSO (302), so live Preview coverage is blocked by protection access. No bypass token was invented and no protection setting was weakened. A separate staging project was neither verified nor created; local/Preview/Production historically share Supabase.

## Verification and operational limits

Final local evidence: 232 application/SQL/CLI tests and 162 runner tests passed with zero failed/skipped; 30 fixture Playwright tests passed on three browser projects; lint passed with two pre-existing runner warnings; typecheck and production build passed. Dependency security gate passed with zero high/critical and 16 moderate findings. The live operator CLI's read-only PR reconciliation returned `PR Pending` for the verified remote dev SHA. These results are local/test and read-only observations, not remote CI success or deployment approval.

The final command results and counts are recorded in the task implementation artifacts and private `.ai-collab/.runtime/release-readiness-20261031/` logs. Application and SQL tests, CLI integration fixtures, lint, typecheck, production build, local E2E and security checks are run locally; remote GitHub CI has not run for these commits. One intermediate runner test failed when its established dummy-token fixture was changed; the fixture was restored, the scanner retained the existing exact path/value exemption and its 32-test release suite passed again. No runner implementation was changed or gate bypassed.

Release status receipts, health results and rollback provenance are implemented and tested using deterministic external API fixtures, including executing the real CLI in disposable Git repos. They are not real merge/deployment receipts. Live runtime error visibility, alert delivery/ownership, backups and rollback readiness remain unverified. Next logging is disabled to avoid exposing auth arguments; generic user-facing errors alone do not provide operational alerting. The current deployment cannot be declared healthy while Supabase is inactive and health routes fail.

## Required owner actions, in order

1. Connect a supported GitHub account/plugin or provision scoped operator API auth outside the checkout; assign an independent human reviewer.
2. Explicitly approve pushing the reviewed dev commits/creating the release PR, then verify all six remote CI checks on the resulting revision. Configure main protection/provider-bound contexts, no bypass/force/deletion, independent review, and auto-merge disabled. No remote task acceptance until these observations pass.
3. Decide and separately approve restoring the inactive Supabase project. After restoration, re-read migration history/RLS/Auth, back up the database and approve only the actual missing schema changes with a concrete recovery/forward-fix plan. No migration or restore has been authorized by this report.
4. Verify Production env and canonical URL without exposing values; separately approve any necessary changes. Establish read-only protected Preview access, monitoring/alert ownership and a healthy known-good rollback target. Re-test the failed endpoints and approved core flows against the candidate.
5. Before merge, explicitly approve its exact PR/head/base SHA and Vercel Production impact, or separately approve and verify a deployment/promotion configuration that isolates that impact. Generate short-lived authorization only after this decision. Never infer deployment approval from CI success or the local-policy waiver.
6. After the approved manual merge/deployment, read GitHub's resulting full merge SHA, verify the Production alias points to that exact READY deployment and pass fresh health checks. Only then record `Deployed`. A failed rollout requires a separate rollback decision, not an automatic database reversal.

## Changed paths

Policy and evidence: `docs/release-policy.md`, `docs/release-operations.md`, `docs/production-readiness-2026-10-31.md`, `docs/testing-m3-e2e.md`, `.ai-collab/BACKLOG.md`, `.ai-collab/STATE.md`, and `PLAN.md`, `IMPLEMENTATION.md`, `REVIEW.md` under each of `.ai-collab/tasks/release-pipeline-policy/`, `release-pr-ci/`, `release-merge-tracking/`. Review artifacts explicitly record the owner waiver; they do not invent Antigravity approvals.

CI/configuration: `.github/workflows/ci.yml`, `.github/pull_request_template.md`, `.gitignore`, `package.json`, `package-lock.json`, `tsconfig.json`, `playwright.config.ts`.

Implementation: `lib/github/client.ts`, `lib/github/types.ts`, `lib/github/status-checks.ts`, `lib/github/controlled-merge.ts`, `lib/github/release-tracking.ts`, `lib/vercel/deployment.ts`, `lib/vercel/types.ts`, `scripts/check-release-security.mjs`, `scripts/release.mts`.

Tests: `tests/github-ci.test.mjs`, `tests/github-controlled-merge.test.mjs`, `tests/vercel-deployment.test.mjs`, `tests/release-security.test.mjs`, `tests/release-tracking.test.mjs`, `tests/release-cli.test.mjs`, `tests/e2e/fixtures/local-test.ts`, and the five existing E2E specs `admin-redirect`, `cart`, `catalog`, `contact-form`, `product-detail`. No SQL migration, application Email source, Production secret or orchestrator implementation was modified.

## Local commits and task acceptance

- dce1dad: owner-approved Release policy; local policy task DONE under the explicitly recorded owner review-gate exception.
- dbe8937: CI workflow/security/test fixes; IMPLEMENTED and TESTED locally, remote acceptance BLOCKED.
- 9065c9e: merge preflight/exact serving-SHA tracking/readiness runbook; IMPLEMENTED and TESTED locally, dependency and remote activation BLOCKED.

These commits are local only. Policy APPROVED is the owner decision; there is no independent Antigravity/code/PR approval. No PR, remote CI execution, merge or new Production deployment resulted from these commits. A separate metadata commit records these hashes in backlog/task artifacts.
