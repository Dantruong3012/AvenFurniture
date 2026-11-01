# Review: orchestrator-replan-recovery

Status: APPROVED
Reviewer: Antigravity

## Review Summary

The implementation in task `orchestrator-replan-recovery` provides a principled, fail-closed recovery mechanism for tasks that are `BLOCKED` during `IN_PROGRESS` because the Planning allowlist omitted existing integration files. It resolves the blocker for `storefront-inquiry-forms` without weakening coordinator integrity, bypassing review checkpoints, or mutating working state arbitrarily.

The new command `replan`:
1. Strictly targets checkpoints that are `BLOCKED` with the verified allowlist error pattern (`codex: The exact path allowlist excludes the existing cart and product integration points. No files changed.`).
2. Asserts full alignment across `checkpoint.json`, `BACKLOG.md`, `STATE.md`, and task artifacts before taking any action.
3. Requires a revised, approved `PLAN.md` with explicit, validated `Owned paths` that differ from the flawed sequence 1 paths.
4. Requires an Antigravity `APPROVED` review of this runner upgrade committed to Git history, refusing any application source or task metadata in that commit.
5. Preserves all history: archives the blocker `IMPLEMENTATION.md` to `.ai-collab/.runtime/<task>-<seq>-replan-blocker.md` (mode 0600), preserves original receipts, and stores prior errors/receipts in `checkpoint.replanHistory`.
6. Enforces that on subsequent `resume`, Antigravity Planning genuinely re-runs with an exact tracked file index and bounded excerpts of referenced integration files. The returned paths must match the approved revised plan's `Owned paths` exactly before the coordinator accepts them.

## Reviewed Files

- `.ai-collab/orchestrator.mjs`
- `.ai-collab/orchestrator.integration.test.mjs`
- `.ai-collab/README.md`
- `.ai-collab/tasks/orchestrator-replan-recovery/IMPLEMENTATION.md`
- `.ai-collab/tasks/storefront-inquiry-forms/PLAN.md`

## Test & Build Verification Results

- **Orchestrator Unit & Integration Tests**: PASS (40/40 tests in 18.7s via `node --test .ai-collab/orchestrator*.test.mjs`). Covers approved replan, genuine second Planning execution, receipt preservation, blocker archiving, rejection of unapproved reviews, rejection of unapproved/unchanged plans, rejection of dirty/staged/committed application source, and rejection of path deviations during fresh Planning.
- **Application Test Suite**: PASS (59/59 tests in 2.2s via `npm test`). Includes isolated PGlite migration, RLS, auth session security, catalog transactions, and inquiry service layer tests.
- **Lint Check**: PASS (`npm run lint` exited cleanly with 0 errors).
- **TypeScript Check**: PASS (`npm run typecheck` exited cleanly with 0 errors).
- **Production Build**: PASS (Next.js 16.3.8 webpack build completed successfully; 22/22 routes prerendered).
- **Git Diff Check**: PASS (`git diff --check` clean).

## Security Assessment

1. **Gatekeeping & Authorization**: `replan` requires `git show <HEAD>:.ai-collab/tasks/orchestrator-replan-recovery/REVIEW.md` to contain `Status: APPROVED` and `Reviewer: Antigravity`. This prevents unauthorized runner upgrades or self-approvals.
2. **Fail-Closed Execution**: `acquireLock(lock, true)` ensures single-coordinator execution. All preconditions, Git ancestry (`merge-base`), working tree cleanliness, and plan validity checks execute before any state or artifact changes. Any failure aborts with zero side effects.
3. **Receipt Integrity & Cryptographic Chain**: Original planning receipts are never modified or deleted. On resume, Antigravity CLI executes with mode `plan` to produce a fresh, verifiable read-only receipt with matching input/output digests. The coordinator enforces that returned paths match `checkpoint.approvedReplanPaths` byte-for-byte.
4. **Context Boundary & Information Disclosure**: `planningContext()` supplies tracked file paths under `app/`, `components/`, `lib/`, and `tests/` bounded to 16,000 characters, and at most 10 file excerpts (1,400 chars each) with `assertNoSecrets()` validation.
5. **Git Baseline Preservation**: `replanRunnerPaths` restricts intervening commits strictly to runner code and review artifacts. Commits touching application source, `BACKLOG.md`, `STATE.md`, or the task plan are rejected.

## Residual Risks & Mitigations

- **Risk**: Second Planning invocation might hallucinate or deviate from the approved plan.
  - **Mitigation**: `taskLoop()` enforces `checkpoint.approvedReplanPaths`: if Antigravity Planning CLI returns paths that differ in count or identity from the approved revised plan, the coordinator immediately throws an error and blocks execution.
- **Risk**: Dirty working files mixed into the runner commit.
  - **Mitigation**: Preflight checks in `replan` reject any runner commit that includes metadata or application source.

## Allowed Files for Commit

Codex is authorized to stage and commit ONLY the following 5 files:
```
.ai-collab/README.md
.ai-collab/orchestrator.integration.test.mjs
.ai-collab/orchestrator.mjs
.ai-collab/tasks/orchestrator-replan-recovery/IMPLEMENTATION.md
.ai-collab/tasks/orchestrator-replan-recovery/REVIEW.md
```

> [!CAUTION]
> **DO NOT STAGE OR COMMIT THE FOLLOWING WORKING TREE FILES**:
> - `.ai-collab/BACKLOG.md`
> - `.ai-collab/STATE.md`
> - `.ai-collab/tasks/storefront-inquiry-forms/PLAN.md`
> - `.ai-collab/tasks/storefront-inquiry-forms/IMPLEMENTATION.md`
>
> These 4 files represent the current blocked task metadata. If committed in the runner commit, `replan` will reject the commit.

## Recovery Instructions for Real Checkpoint

Once Codex has committed the runner upgrade:
1. Run `node .ai-collab/orchestrator.mjs replan` to transition the blocked checkpoint to `PLANNING`, archive the blocker, and adopt the revised plan.
2. Run `node .ai-collab/orchestrator.mjs status` to verify `phase: PLANNING`, `task: storefront-inquiry-forms`, `blocked: []`.
3. Run `node .ai-collab/orchestrator.mjs resume` to trigger fresh Antigravity Planning and proceed directly into Codex implementation with all 11 integration paths.
