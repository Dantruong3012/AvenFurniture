# Implementation: orchestrator-git-permission-recovery

Status: READY_FOR_REVIEW

The active `email-outbox-dispatch` checkpoint is `BLOCKED` at `IN_PROGRESS`, round 1, after `git write-tree` returned 128 before a new Codex CLI invocation. The direct Git diagnostic was `.git/index.lock: Operation not permitted`; a Git probe with permission to write the index succeeded. The approved email Planning receipt and partial email source remain in place.

The runner now offers `recover-git-permission` only for that exact class of saved failure. It verifies the task/metadata, approved plan and original Planning receipt, unchanged config/check scripts, one reviewed runner-only commit, clean index, owned dirty files, and a successful `git write-tree` before archiving the blocker and returning to the same `IN_PROGRESS` phase. It preserves the original round, receipt, partial source, and prior error in checkpoint history. Ordinary `resume` still rejects `BLOCKED`.

Regression tests cover successful recovery and resume, missing approval, an unrelated source commit, and staged source. The rejected cases leave checkpoint and partial source unchanged.

Verification:

- `node --test .ai-collab/orchestrator*.test.mjs`: PASS, 98 tests.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS after the build completed.
- `npm test`: PASS, 83 tests.
- `npm run build`: PASS.
- `git diff --check`: PASS.

One partial Codex edit in the paused email task had a TypeScript excess-property error in `lib/email/mailer.ts`. The single-line type fix is within that task's approved ownership and is deliberately excluded from the runner-repair commit. Initial typecheck/build overlap also produced transient missing `.next/types` errors; the sequential rerun passed. No Production, database, or real email operation was run.

Review request: Antigravity should inspect the exact runner diff and approve or request changes. No runner repair commit or checkpoint recovery has been performed yet.
