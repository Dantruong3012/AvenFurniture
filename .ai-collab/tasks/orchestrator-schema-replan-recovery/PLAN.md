# Plan: orchestrator-schema-replan-recovery

Status: APPROVED
Planner: Antigravity
Task: orchestrator-schema-replan-recovery

### Objective
Enhance the orchestrator's `replan` command to support tasks blocked when implementation requires expanded file ownership and database schema/migrations, as officially authorized by the project owner.

### Acceptance Criteria
1. **Allowlist & Schema Error Recognition**: `replan` accepts blocked tasks whose blocker reason indicates missing file authorization or database schema requirements (e.g. matching `/^codex: .*(?:exact path allowlist excludes|cannot be implemented within the authorized files)/i`).
2. **Reviewed Runner Gate**: Replan strictly verifies an Antigravity `APPROVED` review committed to Git history under `.ai-collab/tasks/orchestrator-schema-replan-recovery/REVIEW.md` (or existing replan review path), rejecting any intervening application source or unowned files.
3. **Task Metadata Safety**: Replan dirty checks accept modern quota-optimization task artifacts (`IMPLEMENTATION_BRIEF.md`, `IMPLEMENTATION_SUMMARY.md`, `VERIFY_REPORT.md`, `REWORK.md`) in task directories without falsely aborting.
4. **Supabase Path Planning Index**: `planningContext` includes `supabase` in its repository file index so local migration paths can be discovered during planning.
5. **Deterministic Replan Paths Guidance**: When `checkpoint.approvedReplanPaths` is set, the planning prompt explicitly directs Antigravity to return the approved path list.
6. **Integration Tests**: Automated tests verify the expanded replan recovery pattern fails closed on unapproved reviews, unexpected source, or invalid checkpoints.

Owned paths: .ai-collab/orchestrator.mjs, .ai-collab/orchestrator.integration.test.mjs, .ai-collab/README.md, .ai-collab/tasks/orchestrator-schema-replan-recovery/PLAN.md, .ai-collab/tasks/orchestrator-schema-replan-recovery/IMPLEMENTATION.md, .ai-collab/tasks/orchestrator-schema-replan-recovery/REVIEW.md
