# Plan: orchestrator-git-permission-recovery

Status: READY
Planner: Antigravity CLI
Planning result: READY

Recover the `email-outbox-dispatch` checkpoint blocked at `IN_PROGRESS` because the shell sandbox denied creation of `.git/index.lock` during `git write-tree`, before Codex implementation restarted. The source plan and its four-file allowlist remain unchanged.

Acceptance criteria:

1. Accept only the exact saved Git permission blocker, matching `BLOCKED` task metadata, approved email plan, and successful Antigravity Planning receipt.
2. Require a single reviewed runner-only commit, clean staged index, unchanged task-owned and unrelated source outside the existing partial work, and a successful `git write-tree` probe before any checkpoint mutation.
3. Archive the blocker and retain prior error, round, Planning receipt, and logs; resume the same implementation without bypassing tests or Antigravity review.
4. Reject missing approval, unrelated commit paths, staged edits, and workspace drift without changing the checkpoint or source.
5. Do not change application source, database, Production, or real email delivery.

Runner implementation ownership: `.ai-collab/orchestrator.mjs`, `.ai-collab/orchestrator.integration.test.mjs`. Documentation and this task's lifecycle artifacts are separate runner-review evidence.
