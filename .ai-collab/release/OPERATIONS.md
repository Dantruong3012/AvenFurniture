# Release operations and configuration

Implementation stage: M1 and M2 committed. Release automation remains disabled; the old Preview is failed and no new Preview has been proven READY.

## Read-only status

```sh
node .ai-collab/orchestrator.mjs doctor
node .ai-collab/orchestrator.mjs release-status
```

These commands report known evidence and credential availability, not authenticated permission or fabricated remote success. `release-status` displays the durable Preview stage when one exists. No live Preview observation has been certified by M2 yet.

## M2 Preview tracking

The disabled-by-default `release-push` path now observes the Git-triggered Vercel Preview after a verified push. It verifies the project's Production Branch is `main` **before** pushing, searches for the exact dev branch and commit SHA, checks the returned project/commit/branch/Preview target again, and polls the deployment to `READY` with a deadline. It never calls a Vercel write endpoint or starts a duplicate deployment. The current [Vercel list API](https://vercel.com/docs/rest-api/deployments/list-deployments) uses `/v7/deployments` with `projectId`, `sha`, `branch`, and `target` filters; this supersedes the `/v6` URL in the original M2 plan. The project read uses `/v9/projects/{id}` and the deployment detail read uses `/v13/deployments/{id}`.

The coordinator awaits the automatic completion hook while holding its shared lock. When release is enabled after review, the hook archives the completed task, checks the live Vercel Production Branch before any Git push, verifies the remote SHA, and waits for the exact Git Preview result before another development task starts. The manual `release-push` command follows the same preflight and Preview checks under its own lock. A mismatch or failed Preview stops release progress without changing the already completed development task.

Preview state is stored under `.ai-collab/.runtime/releases/<sha>.json`, with an append-only event log beside it. Vercel's observed Git Preview list entry uses `uid` and `target: null` while its detail uses `id` and `target: null`; the adapter verifies the exact Git source and absence of a custom environment before treating this as Preview. A 429 honors `Retry-After` within the configured deadline; a missing, canceled, blocked, errored, or stale-identity deployment fails closed. The snapshot contains deployment IDs and URLs, never tokens or raw API responses. The deployment's `READY` state alone does not mean the storefront has passed E2E or shared-database safety checks.

The existing dev Preview at commit `faab317e3410d45436944dd25314472da62ac422` failed its build because the two public Supabase variables were scoped only to Production. With explicit operator approval on 2026-10-16, exactly `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` were extended to both Production and Preview; read-back verified the targets. Existing failed deployments are unchanged. No Preview build will be retried or triggered until the relevant code has completed review and a permitted Git push occurs.

Local, Preview, and Production share Supabase. M2 makes only Vercel GET requests. Do not submit inquiries, sign up users, edit products, or run migrations through automated live Preview tests. Those scenarios require local disposable fixtures or a separately approved live operation.

The legacy `status`, `run`, `resume`, `stop`, quota recovery and replan commands retain their existing purpose. Do not run them to clear the current admin architecture blocker as part of release setup.

## M1 receipt and recovery

After a new development task completes its verified implementation and metadata commits, the coordinator archives `.runtime/completed/<sha>.json` even while release is disabled. It verifies Antigravity and Codex receipts, independent checks, approved Git tree, metadata-only changes, actual committed approval and a clean worktree. The archive is immutable. Existing Markdown approval is insufficient to reconstruct missing proof.

With release enabled in a reviewed configuration, the coordinator pushes the verified revision to the configured dev branch before continuing the backlog. Failure preserves development DONE and stops with a nonzero exit and separate release evidence. `release-push` retries only after revalidating all evidence and actual remote state. It cannot commit, merge, force push, deploy or migrate a database.

`.runtime/releases/<sha>.json` is the latest snapshot; `<sha>.events.jsonl` retains intents/results. A transport error after a successful remote update is reconciled via `ls-remote`, preventing a duplicate push. A divergent remote or unknown result is a failure, never a reason to reset, rebase or force.

Git operations have a configured timeout. A crashed external Git operation leaves a lock marker so ordinary resume cannot automatically remove a lock while an orphan process might still push. The operator must inspect remaining processes and exact remote SHA before approving lock recovery. No automatic stale-lock deletion for an unresolved external operation.

## Authentication and infrastructure setup

1. Keep `release.config.json` disabled/manual until M1 review and subsequent integration gates pass. M1 alone is not authorization to activate full CI/CD.
2. Configure supported GitHub CLI/API authentication outside chat. Use a scoped GitHub App or account credentials with the permissions listed in DESIGN.md; never copy Git credential-helper output into logs. Git push authentication and API authentication are separate.
3. Repository owner enables branch protection/rulesets on main with required CI/E2E checks and reviews, prohibits force pushes/deletion, and defines allowed merge strategy. M4 must inspect actual protections and fail closed if missing.
4. Restore Vercel access to the known team/project. Verify current Production Branch is main through settings/API, not historical deployment metadata. Use existing Git integration. Verify Preview build/runtime variable names without reading/decrypting or printing values; Local, Preview and Production intentionally share Supabase. Do not change their target. Do not copy Production secret keys into test fixtures.
5. Keep the existing shared Supabase project. No staging project creation is requested. Run only read-only live Preview checks and local mock/disposable tests for writes. Do not submit real inquiries, send emails, change products or use auth flows that persist shared state in automated tests. Record unavailable live write coverage explicitly; obtain scoped user approval before any shared-database mutation.
6. Approve/apply pending Production migrations separately, then refresh schema evidence. The inquiry RPC is currently missing. No merge until its verified prerequisites are satisfied.

## Safe activation sequence

- Resolve the unrelated admin task through Antigravity architecture review. Preserve its checkpoint and work. Activate from a clean dedicated checkout with reviewed runner code; never overwrite or silently adopt the blocked checkpoint.
- Complete and review M2–M8, including deterministic adapters and read-only Preview proof under the shared-database constraints. Validate GitHub protections and Vercel branch tracking live.
- Enable development push/Preview/PR automation only in a reviewed configuration. Keep `releaseMode: manual`; WAITING_RELEASE_APPROVAL must be observed before any merge.
- Auto mode is a later, explicit repository-owner decision and still requires a current authorization for the exact PR/SHA. This implementation task does not authorize it.
- On failed Production health, halt further releases, record incident and known-good deployment; prepare rollback for separate approval. Never reverse database migrations automatically.
