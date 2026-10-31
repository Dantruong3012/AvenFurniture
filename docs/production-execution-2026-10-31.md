# Production release execution — 2026-10-31

Status: IN_PROGRESS locally; external actions awaiting the separate owner approvals required by the new request.

The owner requested actual release execution, preserving existing release tools/security gates, explicitly requiring approval before push, draft PR creation, Supabase Resume, Production migrations, environment changes and merge/deployment. The earlier instruction to stop Antigravity CLI use remains in effect; no independent review is invented. All four deferred Email tasks remain excluded. Existing orchestrator receipts/configuration remain unchanged.

## Fresh observations

At 2026-10-31 21:53 UTC+7, Supabase project `eofdtqnnqgxaoykcbfrv` remained `INACTIVE`, region `ap-northeast-1`, PostgreSQL `17.11.0.003`. GET `/v1/projects/{ref}/restore` returned the available GA version `supabase-postgres-17.11.0.003`. Backup metadata and organization metadata GETs returned 403; no independent backup inventory or billing plan was verified. Reason for pausing is not exposed by these reads; inactivity is a documented possible reason, not an established diagnosis.

GitHub remote dev remains `8a267eeb7cff6a7246927c444d7466c10f35d181`, main remains `7454ca2eacb6185ca3611159d80c0aadf1cd9cd1`, both unprotected; zero workflows/open PRs. Supported GitHub API auth is absent. Local source starts at `386cca4` with four unpushed commits and a clean tree.

Vercel explicit-team project and alias reads confirm Production Branch `main`, automatic domain assignment, alias `aven-furniture.vercel.app` pointing to `dpl_9whkyD1hL2HYVsxuyR2zNXvjR1Ge` at the same main SHA; Preview remains `dpl_8MzUqeA1hSx9d9QPowTfqyHf48Fg` at the remote dev SHA. No Vercel setting changed. Returned env metadata still lacks `NEXT_PUBLIC_SITE_URL`; privileged variables target Production only.

## Approval request A — Resume the existing Supabase project

Proposed action: authenticated **POST** `https://api.supabase.com/v1/projects/eofdtqnnqgxaoykcbfrv/restore`, no backup timestamp, no migration, no project recreation, no version/region/plan selection. Supabase's current official OpenAPI describes this as restoring the existing paused project; its available restore version matches the recorded database version. This is distinct from restoring an older backup or PITR. App/source SHA stays unchanged by this action.

Expected impact: restart the existing Production database/Auth/Storage services and restore provider-held data/configuration from the paused project's state. During restoration the services can remain unavailable. The existing deployed app may regain access; actual users could resume writing through existing functions. No Email provider/scheduler/retry or outbound test will be activated by this work.

Risk/limits: independent backup listing is denied (403), so backup completeness has not been independently proved. The current organization billing plan is also unavailable. Resuming existing compute can affect usage under the current plan; no free-cost guarantee is made. The operation must stop if the provider requires a plan/region/version change, billing upgrade, payment action or an unsupported recovery. No billing change is authorized by Resume approval.

Verification after approval: re-read project status until ACTIVE_HEALTHY or a terminal/error deadline, then read service health, public connection, migration history, schema/RLS/RPC metadata and counts only. Do not log user/account rows or secrets, sign in, submit inquiries, run migrations or other test writes. Preserve sanitized intent/response/status receipts.

Failure/recovery: do not delete/reset the project, restore an older snapshot, recreate a project or auto-pause it. Stop and preserve status/receipts; prepare provider support/recovery options for another owner decision. Before any subsequent migration, require a verified protected backup/export, the exact missing migration set and compatibility/forward-fix plan. A code rollback does not restore a failed database.

Approval state: APPROVED by the owner in this session. Exactly one POST was issued at 2026-10-31T15:00:23Z and returned **403 REJECTED**. The credential can read project/restore-version metadata but cannot Resume. No successful restore is claimed and no POST retry was made. Private receipt: `.ai-collab/.runtime/release-execution-20261031/approved-resume.json`. The owner was asked to Resume through Dashboard or provide scoped Project Admin write credentials outside the repository. The same narrow Resume authorization remains valid after access is corrected; no migration or plan change is authorized.

Sources: [Supabase project pausing/resume](https://supabase.com/docs/guides/platform/free-project-pausing), [official OpenAPI](https://api.supabase.com/api/v1-json), [backups and recovery limits](https://supabase.com/docs/guides/platform/backups), [billing FAQ](https://supabase.com/docs/guides/platform/billing-faq).

## Local work authorized before external approvals

Reconfirm all requested checks, expand fixture coverage for sitemap, missing products, consultant/customer routes, wishlist and read-only API failures. Fix canonical-origin fallback so an unset Production canonical variable does not emit localhost URLs. Return a deliberate temporary-unavailable response for sitemap backend failure instead of an unhandled 500 or a misleading successful partial sitemap. Keep healthy-database missing-product behavior 404 and preserve real backend failure as unavailability; do not manufacture 404 while the database is down. Prepare exact SHA/push/PR/protection requests after checks and local commits.

## Implemented and verified locally

- Production canonical fallback is `https://aven-furniture.vercel.app`; explicitly configured Production HTTP/loopback origins are rejected. Development and CI fixture origins remain supported. No Vercel environment value was changed.
- Replaced Next's metadata sitemap file with a standard `/sitemap.xml` GET route, preserving categories/products/journal/image/date entries and escaping XML. Complete catalog success returns XML; backend failure returns uncached 503 with Retry-After 60. It never hides an outage behind a partial 200 sitemap. Existing journal sitemap regression assertions were retained against the HTTP response.
- Healthy local catalog returns 404/noindex for missing products. No source change was needed to manufacture a 404 when the real database is down. The observed Production 503 remains unavailability until the database and actual lookup can be verified.
- Added fixture E2E for sitemap/404, consultants/Zalo link, customer portal privacy boundaries, anonymous cart/wishlist API 401, malformed catalog IDs 400, guest wishlist persistence and viewport overflow on Chromium/Firefox/mobile Chromium. The explicit consultant RPC is answered in the test preload; no POST reaches real Supabase.

Validation: lint passed (two pre-existing runner warnings); `npx next typegen` and TypeScript passed; production build passed; 235 unit/integration/SQL/CLI tests passed; 162 orchestrator tests passed; 42/42 fixture E2E passed; tracked/staged credential checks passed; dependency audit gate passed (16 moderate, zero high/critical). No test was skipped. One intermediate TypeScript attempt raced with a concurrent build clearing generated types; the commands were rerun sequentially and passed. One journal regression test was updated for the deliberate route move without dropping article/date assertions.

Coverage limits: Auth login/logout/session, admin CRUD, media signing/upload authorization and RLS are exercised by mocked service/SQL tests, not live Production mutations. Actual Cloudinary upload, authenticated Production business flows and live account/data compatibility were not tested without permission. Local fixture success is not live readiness.

## Fresh live endpoint and monitoring checks

Production GET `/`, `/products`, `/cart`, `/wishlist`, `/contact`, `/admin/login` returned 200; `/consultants` and `/portal` remain 404 on old main; `/sitemap.xml` remains 500; missing-product probe remains 503. All ten Preview probes returned Vercel SSO 302. These reads do not prove the database-backed workflows work. Source fixes remain local until an approved push/PR/merge/deployment.

Vercel runtime-error MCP returned 403. Its mapped same-project/team CLI fallback exited 1 and produced no JSON log records. A follow-up using the existing Vercel API credential through an isolated mode-600 CLI auth directory failed the CLI user lookup with “User not found (404)”; that temporary credential copy was removed. This credential works for project/deployment metadata but does not establish CLI/observability access. Runtime error visibility/alerting remains unverified; lack of returned logs is not a clean health result. Raw log/error bodies were withheld. Production deployment and alias remain unchanged.

Local source fix commit: `fa02eb8` (`fix(release): handle sitemap outages and production canonical URLs`). This commit is not pushed or deployed. The full tested release candidate will include all existing development work since main, not just this fix; the draft PR must disclose that wider scope and its unapproved schema prerequisites.

## Migration, backup and recovery preparation

There are 15 local SQL migrations. Their SQL/RLS behavior passes the disposable PGlite suites; the inquiry transaction, staff Auth/lifecycle, customer identity/cart/wishlist, and media/catalog migrations remain compatibility dependencies for this source. Exact **currently missing** migrations cannot be selected until a fresh live migration history/schema/RPC read succeeds. Historical reports are insufficient. No SQL file was changed and no Production migration was executed. Existing event/outbox schema is preserved; no Email adapter, scheduler or retry activation is in scope.

After Resume/access recovery: read `supabase_migrations.schema_migrations`, public/private RLS/grants and function definitions, confirm `submit_customer_inquiry`, list table/column existence and counts only (products, cart, wishlist, accounts/inquiries), and inspect Auth redirect/canonical configuration without secrets or account records. Compare recorded versions/definitions with local files and their hashes. Review transactional lock behavior and backwards compatibility with both the current Production app and candidate before proposing the exact missing set.

Before applying an approved set, require a verified provider backup or encrypted operator-controlled logical dump outside Git/CI, checksum and `pg_restore --list` validation, plus a successful restore rehearsal in a disposable database. Supabase database backups exclude Storage objects; Cloudinary assets are external and must not be mutated. Free/paused backup availability is not assumed because this token's backup read is denied. Full schema/data dumps contain sensitive information and must never become repository/CI artifacts. Do not run a backup-to-Production restore as a rehearsal.

Recovery policy: prefer additive compatible schema changes and keep the current code deployable; on migration failure halt and preserve database/receipts, prepare forward-fix or a separately approved restore with the exact data-loss window. Application rollback alone cannot reverse schema/data changes. No automatic down migration, reset, drop, snapshot restore, secret rotation or billing action is authorized.

## Pending release actions

Push/draft PR approval will name the exact final dev SHA, current remote dev SHA, main base SHA, repository and normal non-force push command. A dev push can create a Preview and start the new CI workflow; it does not itself authorize merge or Production deployment. Supported GitHub API auth is still required for draft PR creation/protection inspection. Independent human review and provider-bound main protection remain mandatory; neither owner-delegated local decisions nor a successful merge-check replaces them. Production changes and migrations retain separate exact-action approval.
