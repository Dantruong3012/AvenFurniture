# Plan: orchestrator-git-diff-recovery

Status: APPROVED
Planner: Antigravity CLI (Lead Architect)

## Goal

Add official orchestrator recovery command `recover-git-diff` for approved tasks blocked during the post-review git diff whitespace check (`git diff failed (2)`), and configure runner whitespace check to ignore harmless trailing blank lines at EOF (`core.whitespace=-blank-at-eof`).

## Acceptance Criteria

1. Checkpoint must be BLOCKED in phase APPROVED with error `git diff failed (2)`.
2. Checks must have passed and review receipt must be APPROVED.
3. Require clean Git index (unstage blocked task working files before runner commit).
4. Require exactly one reviewed runner commit after checkpoint base HEAD (`2644e929dbb9643a852c59b085a142e631da4175`).
5. Require committed runner review marked APPROVED by Antigravity binding Blocked base HEAD and Blocked task.
6. Verify tested task source digest matches checkpoint verifiedDigest before advancing baseHead.
7. Archive blocked implementation artifact to `.runtime/`.
8. Restore task implementation artifact to `READY_FOR_REVIEW`.
9. Update baseHead to runner commit HEAD, update baseline and digests, and transition checkpoint to RUNNING at phase APPROVED.
10. Update workflow.mjs scanStaged to invoke git diff with `-c core.whitespace=-blank-at-eof` and include stderr in command failure messages.
11. Add regression tests covering recovery and rejection cases.

Owned paths: .ai-collab/workflow.mjs, .ai-collab/orchestrator.mjs, .ai-collab/orchestrator.integration.test.mjs, .ai-collab/README.md, .ai-collab/tasks/orchestrator-git-diff-recovery/PLAN.md, .ai-collab/tasks/orchestrator-git-diff-recovery/IMPLEMENTATION.md, .ai-collab/tasks/orchestrator-git-diff-recovery/REVIEW.md
