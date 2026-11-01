# Implementation: orchestrator-replan-recovery

Status: READY_FOR_REVIEW

## Cause and scope

The `storefront-inquiry-forms` checkpoint is `BLOCKED` at `IN_PROGRESS`: its original Antigravity Planning receipt supplied an exact path allowlist with nonexistent `src/` paths and omitted the real cart and product integration files. Codex returned a blocker before changing source. Antigravity subsequently revised the same task's `PLAN.md` with real integration paths and `Status: APPROVED`.

## Implementation

- Added `node .ai-collab/orchestrator.mjs replan` for the current `BLOCKED` implementation checkpoint caused by the incomplete exact allowlist. It requires a revised approved plan with explicit, changed `Owned paths`, a committed Antigravity `APPROVED` review of the runner upgrade, unchanged application source, no staged changes, and only current-task metadata changes in the working tree. Commits containing application source, `BACKLOG.md`, `STATE.md`, or the storefront plan are rejected as runner upgrades.
- The command archives the existing implementation blocker verbatim in private `.runtime/`, retains its error, old paths, round, original Planning receipt and artifact digest in `replanHistory`, and transitions to `PLANNING`. It does not invoke an agent or silently change the allowlist.
- On later `resume`, Antigravity Planning runs again. Its structured `paths` must pass the unchanged `validatePaths()` and match the revised plan's `Owned paths` exactly before the coordinator accepts them.
- Planning now receives an exact tracked path index for `app/`, `components/`, `lib/`, and `tests/`, plus bounded excerpts of existing files referenced by the plan. The prompt requires exact existing integration points, new modules, test files, and ownership without assuming `src/` or using wildcards.
- Documented the recovery and runner-upgrade process in `.ai-collab/README.md`.

## Verification

- `node --test .ai-collab/orchestrator*.test.mjs`: PASS, 40/40 tests. Fixture coverage includes approved replan, actual second Planning invocation, existing and new paths, preserved receipts/artifact, invalid plan/review, staged or changed source, uncommitted review, non-BLOCKED task, and Planning paths outside approved ownership.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm test`: PASS, 59/59 application tests.
- `npm run build`: PASS.
- `git diff --check`: PASS.

No real `replan`, `resume`, runner commit, Production database operation, or deployment was run. The existing inquiry-service-layer commits and the storefront checkpoint remain untouched.

## Handoff

Antigravity should review this implementation and create `.ai-collab/tasks/orchestrator-replan-recovery/REVIEW.md` with its actual decision. Do not commit until it is `APPROVED`. After approval, commit only the reviewed runner files, this implementation artifact, and the review artifact. Keep `BACKLOG.md`, `STATE.md`, and the storefront task's `PLAN.md` and `IMPLEMENTATION.md` out of that commit. Then an operator may run `replan`, inspect `status`, and use `resume` for fresh Planning.
