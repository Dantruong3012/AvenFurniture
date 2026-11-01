# Plan: orchestrator-architecture-recovery

Status: APPROVED
Planner: Antigravity CLI (Lead Architect)
Conversation ID: `ddae5c29-3e01-4b11-a0fc-6824d658f6dd`

## Goal

Add a narrow `recover-architecture` command for the current `admin-inquiry-portal` checkpoint. The user approved the existing database statuses `new`, `consulting`, `completed`, and `cancelled`; the revised admin plan keeps the original ten source paths. No database or application source change belongs to this runner repair.

## Acceptance criteria

- Recover only the exact blocked architecture/status mismatch at `IN_PROGRESS` with a matching `BLOCKED` backlog row, state pointer, original Antigravity Planning receipt, exact blocker artifact, and revised `APPROVED` admin plan.
- Verify the revised plan keeps the original exact source ownership and uses the four approved statuses. Keep `validatePaths()` strict.
- Verify Git ancestry, the exact previously reviewed intervening commit list bound into a committed Antigravity runner review, and a runner-only final repair commit. Reject any change to admin-owned source paths, unrelated working-tree changes, staged changes, or unreviewed history.
- Reconcile only the two additive package scripts, `test:e2e` and `ai:auto`; verify every pre-existing script and the coordinator's required checks remain byte-identical. Do not blindly bypass the saved script digest.
- Preserve original checkpoint/receipt/logs and archive the blocked implementation artifact. A failed preflight must leave checkpoint and source unchanged.
- Transition to `PLANNING` only after all checks pass. A subsequent `resume` must invoke Antigravity Planning again, enforce the approved ten paths and status semantics, then run normal implementation, tests, review, and commit gates.
- Never stage/commit the blocked admin task metadata in the runner repair. Do not stash, reset, run migrations, alter environment variables, or deploy.

## Ownership and verification

Runner source ownership: `.ai-collab/orchestrator.mjs`, `.ai-collab/orchestrator.integration.test.mjs`, `.ai-collab/README.md`. The coordinator lifecycle artifacts for this repair live beside this plan as `IMPLEMENTATION.md` and `REVIEW.md`.

Run `node --test .ai-collab/orchestrator*.test.mjs`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `git diff --check`. Regression coverage must include successful recovery and real Planning continuation in an isolated Git fixture, plus rejection of wrong status, wrong plan, missing/invalid review, unexpected history, dirty/staged source, changed scripts, and unchanged checkpoint on failure.

The Antigravity planning response approved the narrow runner scope. A correction in the same conversation explicitly approved both additive scripts after the initial response mentioned only `test:e2e`. This plan is not an implementation review or authorization to clear the real checkpoint before the runner fix is reviewed and committed.
