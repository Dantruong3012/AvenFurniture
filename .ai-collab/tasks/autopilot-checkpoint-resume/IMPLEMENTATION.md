# Implementation: autopilot-checkpoint-resume

Status: READY_FOR_REVIEW
Developer: Codex
Base HEAD: e7231eb73a7c78006605bc46b35b6fd08f24fd6b
Commit: -

The launcher now allows a dirty `STOPPED`/`RUNNING` checkpoint to reach the coordinator, which checks the saved source baseline and exact ownership. Fresh dirty tasks, unknown statuses, locks, credentials in the checkout, blocked artifacts, wrong branch/remote and unapproved roadmap remain blocked.

Added `recover-stopped-plan` for the saved `storefront-consultant-zalo` checkpoint. It accepts only the exact stopped phase/error/round, a matching immutable Antigravity Planning receipt, one reviewed runner-only commit, an Antigravity-approved schema-compatible 15-path proposal bound by digest to the review, unchanged application source, no staged changes, and only expected task metadata dirty. It archives the original plan, retains the old receipt and interrupted-turn history, then returns to Planning. The next `resume` must invoke Antigravity Planning and match the approved paths before implementation. Rejected recovery leaves checkpoint and source unchanged.

The consultant revision reflects the existing `consultant_profiles` table and `list_public_consultants()` RPC. It does not change database schema, Auth, RLS, application source, or Production. Local management secrets were moved outside the checkout with the user's approval; the checkout's ignored `.env.local` contains only four public/non-sensitive variables. A build using that reduced file passed.

## Verification

- `node --test .ai-collab/autopilot.test.mjs .ai-collab/orchestrator*.test.mjs`: 116 passed, 0 failed.
- `npm run lint`: passed with 0 warnings after cleanup.
- `npm run typecheck`: passed.
- `npm test`: 103 passed, 0 failed.
- `npm run build`: passed with public-only `.env.local`.
- `git diff --check`: passed.
- Targeted stopped-plan recovery tests: 7 passed, including successful evidence preservation and six refusal cases.
- Real two-CLI isolated smoke before this runner change: `SMOKE_PASSED`; runner digest changes here, so a new smoke is required after integration.

Review must bind the consultant-plan proposal digest, stopped task ID and base HEAD. No commit, push, deployment or migration has occurred in this worktree.
