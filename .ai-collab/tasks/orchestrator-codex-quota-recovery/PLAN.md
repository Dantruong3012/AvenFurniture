# Plan: orchestrator-codex-quota-recovery

Status: APPROVED
Planner: Antigravity CLI
CLI conversation: 1eec1a7d-71b2-4ffd-bdd0-315e4995f272
Account verification: user confirmed login as `kingfurniture04@gmail.com`; CLI identity is not independently exposed
Planning result: APPROVED, no required changes, exact six runner source/document paths approved

The real `storefront-consultant-zalo` Codex CLI implementation failed with a `turn.failed` usage-limit message and left task-owned source files in progress. The existing runner misclassified the CLI exit as an architectural `BLOCKED` checkpoint.

Acceptance criteria:

1. Recognize Codex usage-limit output as `PAUSED_QUOTA` at the same phase, distinct from implementation, architecture and context failures. A time such as `5:26 AM` has no date/timezone, so record no `retryAt` and require operator-verified `resume --quota-ready`.
2. Preserve partial task-owned source, failed private log, original Planning receipt, checkpoint history and existing Git changes. Never retry automatically or mark the task `DONE` without checks/review/commit.
3. Add a narrow `recover-codex-quota` command for the saved legacy `BLOCKED` consultant checkpoint. Require one committed runner-only upgrade with real Antigravity `APPROVED` review bound to blocked HEAD, task ID and failed-log digest; verify original Planning receipt, clean index, task ownership and source baseline before any checkpoint write. Archive the blocker artifact and transition to `PAUSED_QUOTA`.
4. Test direct classification, legacy recovery, refusal paths and controlled resume. Update operator docs.
5. No application source, database, secrets, Production environment, push or deployment changes in this runner task.

Runner ownership: `.ai-collab/orchestrator-core.mjs`, `.ai-collab/orchestrator.mjs`, `.ai-collab/orchestrator.test.mjs`, `.ai-collab/orchestrator.integration.test.mjs`, `.ai-collab/README.md`, `.ai-collab/AUTOPILOT.md`. Lifecycle artifacts stay in this task directory.
