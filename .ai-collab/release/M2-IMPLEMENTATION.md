# M2 Preview tracking implementation

Status: READY_FOR_REVIEW
Author: Codex
Date: 2026-10-16

## Implemented in isolated worktree

- Added a read-only Vercel adapter with a bounded request timeout, exact project/branch/SHA/target verification, Preview discovery and READY polling, 429 Retry-After handling, and sanitized errors.
- Added durable `PUSHED → PREVIEW_DEPLOYING → PREVIEW_READY` snapshots to both the automatic completion handoff and `release-push` command. Failure persists `DEPLOY_FAILED`. No Vercel mutation or duplicate deployment is initiated.
- Narrow Antigravity Planning revision approved `.ai-collab/orchestrator.mjs` as the seventh exact owned source path. The coordinator now awaits Preview tracking while holding its lock before selecting another task.
- Added project/team IDs and bounded Preview timing to the disabled/manual release policy. IDs are public identifiers, not credentials.
- Added deterministic mocked tests for branch mismatch, wrong SHA/ref/project/target, READY/ERROR/CANCELED/BLOCKED/timeout, rate limits, and sanitized errors.
- Documented the shared Supabase database limitation and read-only Preview policy.

## Verification

- `node --test .ai-collab/orchestrator.release.test.mjs`: 27/27 passed, including live API shape, Production Branch preflight, and async lock regression cases.
- `node --test .ai-collab/orchestrator*.test.mjs`: 71/71 passed after async integration.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: 71/71 passed.
- `npm run build`: passed using only the existing two `NEXT_PUBLIC_SUPABASE_*` public values from the main checkout; no secret values entered the build process.
- `git diff --check`: passed.

## Open issues before release activation

1. A read-only live check correctly detected an existing failed Preview. No new Preview was created or proven READY. Deterministic tests cover successful and failed states. `release.config.json` remains `enabled: false` and `releaseMode: manual`.
2. Antigravity CLI was reauthenticated and a fresh headless command verified `kingfurniture04@gmail.com`. M2 still requires a genuine independent review before commit or release activation.
3. M3–M8 gates remain separate milestones. M2 approval alone will not enable pushes, Production deploys, or shared-database writes.

The main checkout, its dirty backlog/state, and its BLOCKED admin checkpoint were not changed. No release push, deployment, database migration, or Production operation was run.

## Read-only Vercel verification and approved Preview configuration

The live Vercel project `aven-furniture` (`prj_PyRDr0N6RUnKTeKWaum17vWfkmkY`) reports Production Branch `main`. A read-only query found the Git Preview for dev commit `faab317e3410d45436944dd25314472da62ac422`, deployment `dpl_GzA9gQsy9UGsHA7M8Ah1NvbeAuSY`, in `ERROR` state. Its list shape uses `uid` and `target: null`; its detail shape uses `id` and `target: null`. The adapter and regression tests were corrected to accept this exact Git Preview shape while rejecting Production, custom environment, and CLI-created deployments. The corrected adapter found the live deployment and reported `Preview deployment ended in ERROR`.

The deployment's sanitized build events identify missing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Read-only environment metadata showed both variables existed only for Production. The operator explicitly approved extending exactly these two public variables to Preview. Their existing records were PATCHed to `target: ["production", "preview"]` without passing or displaying values; a fresh GET verified both targets on both records. No secret-key targets were changed. The old failed deployment remains failed; a future reviewed Git push is needed to produce a new Preview build.
