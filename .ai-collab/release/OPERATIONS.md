# Release operations and configuration

Implementation stage (verified 2026-10-16): M1 and M2 are committed; the M3 local Playwright suite is reviewed, committed, and passing. Release automation remains disabled/manual. A Git-triggered dev Preview is READY, but Vercel SSO prevents an unauthenticated storefront E2E check.

## Current evidence and limits

- The dev Preview for commit `81eb4b0b877bd5941508d15b25b78ca54057b22e` is deployment `dpl_5bm6x9WrR4dER26F3KbCzGTeMNAw` at `https://aven-furniture-hb3xxif2m-dantruong.vercel.app`. The adapter matched the Vercel project, Git SHA, dev branch, and Preview target, then observed `READY`. Public requests to `/`, `/products`, and `/cart` redirected to Vercel SSO; this is deployment proof, not proof that those pages work after authentication.
- The M3 suite passed 21/21 local Playwright cases on Chromium, Firefox, and mobile Chromium with zero skips. It uses a test-only Supabase fetch fixture and browser-intercepted inquiry responses; see [M3 implementation](M3-IMPLEMENTATION.md) and [browser-test instructions](../../docs/testing-m3-e2e.md). It does not test live Preview writes or claim live Preview E2E success.
- The development branch has four newer local commits for M3 and launcher quota recovery that have **not** been pushed. The currently READY Preview therefore does not include those commits.
- The latest `npm run ai:auto -- --smoke --quota-ready` passed the real Antigravity → Codex fixture after the quota-receipt fix. A subsequent `npm run ai:auto -- --check` reported `smokeVerified: true` and `quota: null`. The historical 429 receipt remains on disk; the admin task checkpoint remains `BLOCKED`.
- That same preflight reported `dirty: true`, `credentialFileRisk: true`, `github.authenticated: false` and `github.mainProtected: false`. A separate read-only GitHub API call using the existing macOS Git credential authenticated successfully; the launcher does not yet use that credential source. GitHub `main` was still unprotected. Do not interpret a public GitHub API `200` as authenticated launcher access.

The next release milestones M4–M8 are not implemented. In particular, there is no automated PR/CI-to-merge-to-Production pipeline. Do not enable `release.config.json` or call the current one-command launcher ready for unattended backlog work.

## Read-only status

```sh
node .ai-collab/orchestrator.mjs doctor
node .ai-collab/orchestrator.mjs release-status
```

These commands report local evidence and credential availability, not authenticated permission or fabricated remote success. `release-status` displays a durable Preview stage only when the release coordinator created a receipt for that exact SHA; the manually verified live M2 Preview above is not a receipt for the current local HEAD.

## M2 Preview tracking

The disabled-by-default `release-push` path now observes the Git-triggered Vercel Preview after a verified push. It verifies the project's Production Branch is `main` **before** pushing, searches for the exact dev branch and commit SHA, checks the returned project/commit/branch/Preview target again, and polls the deployment to `READY` with a deadline. It never calls a Vercel write endpoint or starts a duplicate deployment. The current [Vercel list API](https://vercel.com/docs/rest-api/deployments/list-deployments) uses `/v7/deployments` with `projectId`, `sha`, `branch`, and `target` filters; this supersedes the `/v6` URL in the original M2 plan. The project read uses `/v9/projects/{id}` and the deployment detail read uses `/v13/deployments/{id}`.

The coordinator awaits the automatic completion hook while holding its shared lock. When release is enabled after review, the hook archives the completed task, checks the live Vercel Production Branch before any Git push, verifies the remote SHA, and waits for the exact Git Preview result before another development task starts. The manual `release-push` command follows the same preflight and Preview checks under its own lock. A mismatch or failed Preview stops release progress without changing the already completed development task.

Preview state is stored under `.ai-collab/.runtime/releases/<sha>.json`, with an append-only event log beside it. Vercel's observed Git Preview list entry uses `uid` and `target: null` while its detail uses `id` and `target: null`; the adapter verifies the exact Git source and absence of a custom environment before treating this as Preview. A 429 honors `Retry-After` within the configured deadline; a missing, canceled, blocked, errored, or stale-identity deployment fails closed. The snapshot contains deployment IDs and URLs, never tokens or raw API responses. The deployment's `READY` state alone does not mean the storefront has passed E2E or shared-database safety checks.

The older dev Preview at commit `faab317e3410d45436944dd25314472da62ac422` failed its build because the two public Supabase variables were scoped only to Production. With explicit operator approval on 2026-10-16, exactly `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` were extended to both Production and Preview; read-back verified the targets. A subsequent reviewed Git push created the READY Preview identified above. No secret variable target or database configuration was changed.

Local, Preview, and Production share Supabase. M2 makes only Vercel GET requests. Do not submit inquiries, sign up users, edit products, or run migrations through automated live Preview tests. Those scenarios require local disposable fixtures or a separately approved live operation.

The legacy `status`, `run`, `resume`, `stop`, quota recovery and replan commands retain their existing purpose. Do not run them to clear the current admin architecture blocker as part of release setup.

## M1 receipt and recovery

After a new development task completes its verified implementation and metadata commits, the coordinator archives `.runtime/completed/<sha>.json` even while release is disabled. It verifies Antigravity and Codex receipts, independent checks, approved Git tree, metadata-only changes, actual committed approval and a clean worktree. The archive is immutable. Existing Markdown approval is insufficient to reconstruct missing proof.

With release enabled in a reviewed configuration, the coordinator pushes the verified revision to the configured dev branch before continuing the backlog. Failure preserves development DONE and stops with a nonzero exit and separate release evidence. `release-push` retries only after revalidating all evidence and actual remote state. It cannot commit, merge, force push, deploy or migrate a database.

`.runtime/releases/<sha>.json` is the latest snapshot; `<sha>.events.jsonl` retains intents/results. A transport error after a successful remote update is reconciled via `ls-remote`, preventing a duplicate push. A divergent remote or unknown result is a failure, never a reason to reset, rebase or force.

Git operations have a configured timeout. A crashed external Git operation leaves a lock marker so ordinary resume cannot automatically remove a lock while an orphan process might still push. The operator must inspect remaining processes and exact remote SHA before approving lock recovery. No automatic stale-lock deletion for an unresolved external operation.

## Authentication and infrastructure setup

1. Keep `release.config.json` disabled/manual until the remaining integration gates pass. M1–M3 local reviews do not authorize full CI/CD.
2. Configure supported GitHub CLI/API authentication outside chat. Use a scoped GitHub App or account credentials with the permissions listed in DESIGN.md; never copy Git credential-helper output into logs. Git push authentication and API authentication are separate.
3. Repository owner enables branch protection/rulesets on main with required CI/E2E checks and reviews, prohibits force pushes/deletion, and defines allowed merge strategy. M4 must inspect actual protections and fail closed if missing.
4. The Vercel project GET and Production Branch `main` check passed through the existing token. Keep using the Git integration and verify each deployment by exact identity. The two approved public Supabase variables now target Preview and Production; do not change any further environment target without approval. Local, Preview and Production intentionally share Supabase. Do not copy Production secret keys into test fixtures.
5. Keep the existing shared Supabase project. No staging project creation is requested. Run only read-only live Preview checks and local mock/disposable tests for writes. Do not submit real inquiries, send emails, change products or use auth flows that persist shared state in automated tests. Record unavailable live write coverage explicitly; obtain scoped user approval before any shared-database mutation.
6. Approve/apply pending Production migrations separately, then refresh schema evidence. The inquiry RPC is currently missing. No merge until its verified prerequisites are satisfied.

## Safe activation sequence

- Resolve the unrelated admin task through Antigravity architecture review. Preserve its checkpoint and work. Activate from a clean dedicated checkout with reviewed runner code; never overwrite or silently adopt the blocked checkpoint.
- Complete and review M2–M8, including deterministic adapters and read-only Preview proof under the shared-database constraints. Validate GitHub protections and Vercel branch tracking live.
- Enable development push/Preview/PR automation only in a reviewed configuration. Keep `releaseMode: manual`; WAITING_RELEASE_APPROVAL must be observed before any merge.
- Auto mode is a later, explicit repository-owner decision and still requires a current authorization for the exact PR/SHA. This implementation task does not authorize it.
- On failed Production health, halt further releases, record incident and known-good deployment; prepare rollback for separate approval. Never reverse database migrations automatically.
