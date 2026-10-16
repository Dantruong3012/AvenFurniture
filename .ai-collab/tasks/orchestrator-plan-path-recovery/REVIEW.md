# Review: orchestrator-plan-path-recovery

Status: APPROVED
Reviewer: Antigravity

## Review Summary

The implementation in task `orchestrator-plan-path-recovery` resolves the root cause of the sequence 3 Planning failure for `inquiry-service-layer` without compromising coordinator security or relaxing file path boundaries.

The previous failure occurred because the task plan listed `.ai-collab/tasks/inquiry-service-layer/IMPLEMENTATION.md` under Codex ownership, and the Planning prompt requested all implementation paths without distinguishing application source ownership from coordinator-managed lifecycle artifacts. When Antigravity included that path in its structured output, `validatePaths()` correctly rejected `.ai-collab/` as unsafe, causing the runner to pause and mark the checkpoint `BLOCKED`.

The fix clarifies the prompt and schema contract so that Planning `paths` represents exclusively editable application source, tests, and local migration files. The strict validation in `validatePaths()` remains intact and rejects any `.ai-collab/` paths, path traversal, or out-of-scope targets. A dedicated fail-closed recovery command `recover-plan-path` safely adopts the existing validated sequence 3 Planning receipt, purges the lifecycle artifact from `paths`, archives the error evidence, restores the previous implementation artifact, and transitions the checkpoint to `READY` without repeating the planning call or forging any approvals.

## Verification Checklist

1. **Planning Contract Distinction**: Verified. The JSON schema for Planning results (`orchestrator-core.mjs`) and the planning prompt in `orchestrator.mjs` explicitly clarify that `paths` contains only application source, test, and local migration paths. Coordinator-managed lifecycle artifacts (`PLAN.md`, `IMPLEMENTATION.md`, `REVIEW.md`, `BACKLOG.md`, `STATE.md`) are explicitly excluded.
2. **Exclusion of `IMPLEMENTATION.md` from Source Paths**: Verified. `recoverPlanPath()` filters the single offending lifecycle artifact path from `receipt.result.paths`, and validates that the remaining paths conform to `validatePaths()`. Future planning prompts explicitly instruct Antigravity to omit all `.ai-collab/` artifacts.
3. **Integrity of `validatePaths()`**: Verified. `validatePaths()` in `orchestrator-core.mjs` was not modified or relaxed. It strictly forbids leading slashes, path traversal (`..`), `.ai-collab/`, and `.git/`.
4. **Targeted Recovery Scope**: Verified. `recoverPlanPath()` strictly asserts that `checkpoint.status === 'BLOCKED'`, `checkpoint.phase === 'PLANNING'`, `checkpoint.round === 0`, and `checkpoint.error === 'Unsafe plan path: .ai-collab/tasks/<id>/IMPLEMENTATION.md'`. Any other error or state immediately aborts.
5. **Authentic Planning Receipt & Review Verification**: Verified. Recovery requires a genuine, saved, read-only Planning receipt matching the checkpoint sequence with `exitCode === 0`, `status === 'READY'`, and matching input/output digests. It also inspects Git history to ensure the runner upgrade commit contains a committed Antigravity `APPROVED` review (`planRecoveryReviewPath`). No results, receipts, or reviews are fabricated.
6. **Fail-Closed Execution**: Verified. All assertions, Git checks, working tree checks, and receipt checks execute prior to mutating the checkpoint or disk state. Regression tests verify that unapproved reviews, altered blocker artifacts, committed application sources, or dirty source files fail without modifying the checkpoint or leaving stray artifacts.
7. **Strict Runner Adoption Whitelist**: Verified. Checkpoint adoption between `checkpoint.baseHead` and current `HEAD` permits only files enumerated in `planRecoveryPaths`. Any application code commits outside this list cause immediate failure.
8. **Preservation of Backlog, State, and Artifacts**: Verified. The approved `PLAN.md` is preserved intact. The generated `BLOCKED` implementation artifact is archived in `.ai-collab/.runtime/<id>-<seq>-blocked-implementation.md` with mode `0600`, and the prior `IMPLEMENTATION.md` is restored from `checkpoint.baseHead`. Uncommitted metadata changes in `BACKLOG.md`, `STATE.md`, and the task's `IMPLEMENTATION.md` are permitted in the working tree and are not required to be part of the runner commit.
9. **Full Execution Lifecycle Preserved**: Verified. Recovering to `READY` does not skip any subsequent steps. When `resume` is called, `inquiry-service-layer` will proceed through Codex implementation (`IN_PROGRESS`), coordinator-driven test verification (`TESTING`), Antigravity code review (`READY_FOR_REVIEW`), and coordinator-staged atomic commit (`COMMITTED → DONE`).

## Test & Build Verification Results

- **Orchestrator Unit & Integration Tests**: PASS (30/30 passed in 14.5s via `node --test .ai-collab/orchestrator*.test.mjs`)
- **Application Tests**: PASS (43/43 passed in 1.5s via `npm test`)
- **Lint**: PASS (clean exit via `npm run lint`)
- **Typecheck**: PASS (clean exit via `npm run typecheck`)
- **Production Build**: PASS (Next.js 16.3.8 webpack build completed successfully via `npm run build`)
- **Git Diff Hygiene**: PASS (clean exit via `git diff --check`)

## Allowed Files for Commit

Codex is authorized to stage and commit ONLY the following 6 files:
- `.ai-collab/README.md`
- `.ai-collab/orchestrator-core.mjs`
- `.ai-collab/orchestrator.integration.test.mjs`
- `.ai-collab/orchestrator.mjs`
- `.ai-collab/tasks/orchestrator-plan-path-recovery/IMPLEMENTATION.md`
- `.ai-collab/tasks/orchestrator-plan-path-recovery/REVIEW.md`

> **CRITICAL**: The following working tree files MUST REMAIN UNCOMMITTED:
> - `.ai-collab/BACKLOG.md`
> - `.ai-collab/STATE.md`
> - `.ai-collab/tasks/inquiry-service-layer/IMPLEMENTATION.md`
> Committing any of these files into the runner commit will cause `recover-plan-path` to reject the commit.

## Handoff & Next Steps

1. **Codex Commit**:
   Create a conventional commit for the runner upgrade:
   ```bash
   git add \
     .ai-collab/README.md \
     .ai-collab/orchestrator-core.mjs \
     .ai-collab/orchestrator.integration.test.mjs \
     .ai-collab/orchestrator.mjs \
     .ai-collab/tasks/orchestrator-plan-path-recovery/IMPLEMENTATION.md \
     .ai-collab/tasks/orchestrator-plan-path-recovery/REVIEW.md
   git commit -m "feat(orchestrator): add plan path recovery and source-only path contract"
   ```
2. **Execute Recovery**:
   Run the recovery command:
   ```bash
   node .ai-collab/orchestrator.mjs recover-plan-path
   ```
3. **Verify Status**:
   Inspect status to confirm checkpoint is `READY` with 5 source paths:
   ```bash
   node .ai-collab/orchestrator.mjs status
   ```
4. **Resume Autonomous Execution**:
   Resume the coordinator to run Codex implementation and independent verification for `inquiry-service-layer`:
   ```bash
   node .ai-collab/orchestrator.mjs resume
   ```
