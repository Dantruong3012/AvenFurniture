# Plan: autopilot-checkpoint-resume

Status: APPROVED
Planner: Antigravity CLI
CLI conversation: e9f9a0b6-cd13-4f3d-98cb-23d86804f62e

`npm run ai:auto` currently blocks a normal stopped implementation because `assessQueue` rejects a dirty working tree before returning `RESUME`. The coordinator already checks all changed files against its saved task baseline and exact ownership. The current consultant checkpoint also has an approved schema-compatible plan revision that cannot be adopted by an ordinary `resume`.

Acceptance criteria:

1. Return `RESUME` for `STOPPED` or `RUNNING` checkpoints even when the working tree is dirty, leaving file-level validation to the coordinator.
2. Keep dirty-tree rejection for a fresh task or a completed/idle checkpoint, and reject unknown statuses.
3. Preserve the preflight guards for credentials in workspace, blocked artifacts, lock, wrong branch/remote, and unapproved roadmap.
4. Add regression tests and update launcher documentation.
5. Do not change application source, env files, database, push, or deployment behavior in this runner fix.
6. Add a reviewed recovery command for the exact stopped consultant task. It verifies the original Planning receipt, one reviewed runner-only commit, original source baseline, unstaged index, exact approved revised plan and its digest in the review, then archives the old plan and checkpoint evidence before returning to `PLANNING`. A later `resume` must call Antigravity Planning again and enforce all 15 exact source paths. Failure leaves checkpoint and source intact.

Implementation ownership: `.ai-collab/autopilot-core.mjs`, `.ai-collab/autopilot.test.mjs`, `.ai-collab/orchestrator.mjs`, `.ai-collab/orchestrator.integration.test.mjs`, `.ai-collab/AUTOPILOT.md`, `.ai-collab/README.md`. Lifecycle and reviewed consultant-plan proposal stay under this task directory.

Expanded scope approved by Antigravity CLI conversation d25b7bcd-235d-40d4-9786-90769a28283d. The user approved the existing-schema consultant scope and local secret relocation separately.
