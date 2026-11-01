# Implementation: orchestrator-plan-path-recovery

Status: READY_FOR_REVIEW

## Cause

The approved `inquiry-service-layer/PLAN.md` lists its `IMPLEMENTATION.md` among Codex-owned files. The Planning prompt requested all implementation file paths without distinguishing source ownership from coordinator-owned lifecycle artifacts. Antigravity returned that artifact in `paths`. `validatePaths()` correctly rejected `.ai-collab/`, and the runner marked the Planning checkpoint `BLOCKED` after persisting the successful Planning receipt.

## Changes

- Clarified the Planning prompt and structured schema: `paths` contains only editable application source, tests, and local migration files. The coordinator owns lifecycle artifacts, even when an older plan lists one under Codex ownership.
- Kept `validatePaths()` unchanged and strict.
- Added `recover-plan-path` for the exact blocked checkpoint and saved successful receipt. Recovery requires a committed Antigravity `APPROVED` review of this runner change, rejects unrelated committed or uncommitted files and staged changes, preserves the original receipt and existing approved plan, archives the generated blocker artifact, and restores the earlier implementation artifact before transitioning to `READY`. It invokes no agent and performs no application or Production operation.
- Added isolated regression tests for the unsafe path, reviewed recovery without a second Planning call, and rejection of unapproved review, unrelated committed or dirty source, or an altered blocker artifact.
- Documented the contract and recovery command in `.ai-collab/README.md`.

## Verification

- `node --test .ai-collab/orchestrator*.test.mjs`: PASS (30/30)
- `npm run lint`: PASS
- `npm run typecheck`: PASS
- `npm test`: PASS (43/43)
- `npm run build`: PASS
- `git diff --check`: PASS

The real `inquiry-service-layer` checkpoint remains `BLOCKED` at `PLANNING` with its saved Planning receipt. No `run`, `resume`, recovery command, commit, Production migration, or deploy was performed against this repository.

## Review handoff

Antigravity should review the runner diff and evidence, then write `.ai-collab/tasks/orchestrator-plan-path-recovery/REVIEW.md` with its actual decision. Only after `APPROVED` may these runner files and the review artifact be committed. Leave `BACKLOG.md`, `STATE.md`, and `inquiry-service-layer/IMPLEMENTATION.md` uncommitted. Once the reviewed commit exists, run `node .ai-collab/orchestrator.mjs recover-plan-path`, inspect `status`, and then run `resume` for the same task.
