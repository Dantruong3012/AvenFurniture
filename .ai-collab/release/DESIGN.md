# Release orchestration design and milestone plan

Status: DRAFT
Author: Codex (user-assigned architecture role)

This is a proposed architecture, not Antigravity approval or production authorization. Review milestones independently. A passing M1 does not establish end-to-end CI/CD readiness.

## Architecture

Keep the existing development state machine and checkpoint compatible. Add a separate release coordinator which consumes immutable completion evidence keyed by exact metadata commit SHA. Both coordinators use `.ai-collab/.lock`. New `release.config.json` is separate from the existing development config digest and defaults to `enabled: false`, `releaseMode: manual`.

Development `DONE` retains its legacy meaning: independently tested/reviewed local work. Release `DEPLOYED` requires live deployment identity and post-deployment health; the two states are never interchangeable. One task may finish development while its release is awaiting operator approval. A production incident stops further release attempts while allowing explicitly authorized local development.

Each external operation records intent before mutation and reconciles actual external state after interruption. Identity is `{repository, sourceBranch, sourceSha, targetBranch, prNumber, mergedSha, deploymentId}`. Receipts contain timestamps, inputs/digests, external IDs and observed outcomes, never tokens, env values or raw credential-bearing errors. Store append-only event history plus an atomic latest snapshot per release revision. An unknown outcome is NEEDS_OPERATOR or a retryable failure, never success.

Use injectable GitHub and Vercel adapters with structured responses. Authentication is supplied out of band through supported CLI login or scoped environment credentials. Do not invoke shell command strings from model output. Bound HTTP request timeouts, pages, polling windows and retries; honor Retry-After for 429, otherwise exponential backoff with jitter. Reconcile writes before retrying. Verify config digest on resume.

## Target transitions (planned beyond M1)

| From | Successful transition | Failure / recovery rule |
| --- | --- | --- |
| APPROVED | COMMITTING → COMMITTED | Verify existing commit tree after crash before another commit; retain legacy APPROVED recovery |
| COMMITTED | PUSHING → PUSHED | PUSH_FAILED; recheck remote SHA before retry; never force |
| PUSHED | PREVIEW_DEPLOYING → PREVIEW_READY | DEPLOY_FAILED or bounded timeout; exact SHA/project required |
| PREVIEW_READY | E2E_TESTING → E2E_PASSED | E2E_FAILED; keep artifacts, return scoped feedback, max configured rounds and fresh review/commit |
| E2E_PASSED | PR_CREATING → PR_OPEN | Reconcile PR by repo/head/base, forbid duplicate open PRs and stale head SHA |
| PR_OPEN | CI_CHECKING → RELEASE_READY | CI_FAILED; checks must belong to exact current revision and expected GitHub App |
| RELEASE_READY | WAITING_RELEASE_APPROVAL | Default manual policy; absent protection or schema evidence → NEEDS_OPERATOR |
| WAITING_RELEASE_APPROVAL | MERGING → MERGED | Requires owner-enabled auto mode plus unexpired PR/base/SHA-bound authorization, current protections/checks/reviews; stale authorization is rejected |
| MERGED | PRODUCTION_DEPLOYING → PRODUCTION_READY | Match actual merge result SHA, target Production and assigned domain; never start a duplicate deploy |
| PRODUCTION_READY | POST_DEPLOY_TESTING → DEPLOYED → DONE | Read-only checks plus bounded runtime monitoring; failure → PRODUCTION_UNHEALTHY and incident/rollback options |

PAUSED_QUOTA applies to both CLIs; retain phase and retry time. BLOCKED is an architecture/implementation gate. NEEDS_OPERATOR covers unknown rights, missing schema, unresolved external operations or invalid authorization. A recovery cannot silently erase an architectural blocker or reuse approval for changed source.

## Independently reviewable milestones

| Milestone | Deliverable and acceptance | External prerequisites |
| --- | --- | --- |
| M1 — Push/receipt | Durable completed evidence; exact branch/repo/worktree/commit validation; historical secret scan; bounded Git operations; fetch/divergence guard; push and independent remote-SHA receipt; local bare-remote tests including crash reconciliation. Implemented in current patch, pending review. | Git authentication; live pushes disabled until integration/branch tracking gates are verified |
| M2 — Preview | Vercel adapter verifies actual configured Production Branch; find Git deployment by project + exact SHA + dev ref + non-production target; bounded polling; failure logs redacted; no manual duplicate deploy. Mock wrong-SHA/failure/timeout/rate-limit tests and a separately authorized live read-only check. Implementation and Antigravity review are complete; the read-only live proof correctly identified an old failed Preview. A new Preview has not been created or proven READY. | Vercel team access restored; Preview env and deployment protection access |
| M3 — E2E | Playwright public catalog/detail/images/cart/form validation/admin redirect tests. Local, Preview and Production share one Supabase project (operator-confirmed). Preview probes must be read-only: no successful inquiry submissions, product writes, real emails, or database-changing auth flows. Use local mocks for write/role scenarios and report their coverage separately; never present mocked writes as live E2E. Any future live write requires explicit operator approval; artifacts redact sensitive input. No skips count as PASS. Fix loop limited to plan scope with fresh tests/review/commit. | Playwright/browser install and read-only access to existing real catalog; protected Preview access if applicable. No new Supabase project required or authorized |
| M4 — PR/CI | GitHub API adapter reconciles PRs; body includes changelog, reviewed SHAs, Preview/E2E and migration risks. CI jobs: npm ci, lint, typecheck, app/orchestrator tests, build, secret scan, isolated SQL checks; Preview E2E job with trusted secrets. Exact revision/check identities and protections enforced. | API identity with contents read, PR write, checks/actions read; owner configures required checks/rulesets (do not change automatically) |
| M5 — Controlled merge | Manual default, no auto-enable. Owner authorization bound to repo/PR/base/SHA/expiry, verified GitHub identity and required approvals. Fresh check/protection/E2E/schema gates immediately before approved merge method; record resulting main SHA; no dev branch deletion. | Protected main, approved merge strategy, owner-enabled mode, current release authorization, verified migration/env prerequisites |
| M6 — Production tracking | Observe Git-triggered deployment for actual merged SHA, target Production, READY and correct domains. Respect deployment checks/protection. Read-only adapter; no duplicate deploy. | Vercel read access, verified main branch tracking/domain configuration |
| M7 — Health/monitoring | Read-only homepage/catalog/detail/assets/admin-protection checks; bounded runtime error window; DEPLOYED only after health. On failure persist incident and known-good deployment, block further releases and prepare rollback options. | Runtime logs access; realistic read-only probes and safe error budgets |
| M8 — Recovery/hardening | Versioned release checkpoints, explicit safe state transitions and retries, old development checkpoint tests, Codex quota handling, complete status dashboard and operational docs, end-to-end mocked failure matrix plus authorized read-only Preview proof; live write coverage remains explicitly unavailable. | All earlier milestones approved, credentials available, blocked dev task resolved through its own review |

Every milestone produces its own implementation evidence and Antigravity review before commit. Do not claim unfinished adapters or mocked responses are live infrastructure proof. Do not batch all eight milestones into one unreviewed change.

## Migration/authorization evidence

Production release evidence must enumerate migrations/functions/policies/env names required by the release and compare with freshly read Production schema/history. Unknown compatibility blocks merge. The current missing inquiry RPC is an explicit NEEDS_OPERATOR gate. Operator approval to run SQL is separate from owner approval to merge; neither may be inferred from task review. Validate additive migration order using local disposable test infrastructure, then require backward compatibility with the currently deployed code. Never undo SQL as part of automated rollback.

## Current checkpoint compatibility

M1 never edits the current `admin-inquiry-portal` checkpoint, backlog/state or artifacts. Adding runner files changes the repository baseline, so do not resume that blocked task under a newly committed runner without a separately reviewed upgrade-adoption path or a clean dedicated checkout after its architecture blocker is resolved. Existing narrow quota/replan allowlists are not expanded to bypass it. No fake completion receipts are generated for historical commits whose complete checkpoint evidence is unavailable.

## Shared database constraint (operator confirmed)

Local, Vercel Preview and Vercel Production use one Supabase database. Keep this architecture. No new Supabase project, no shared-database writes/migrations/reset/truncate/deletes, and no Auth/RLS changes are authorized by this upgrade. Read-only schema inspection is allowed. A missing staging database does not block runner development or read-only Preview testing; it limits the live coverage we can honestly claim. For schema/constraint blockers, propose a backward-compatible change against current schema and data before requesting specific approval. Local mocks and disposable SQL tests must never resolve their connection to the shared project.
