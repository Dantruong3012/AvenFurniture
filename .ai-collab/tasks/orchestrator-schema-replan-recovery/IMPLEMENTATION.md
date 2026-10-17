# Implementation: orchestrator-schema-replan-recovery

Status: READY_FOR_REVIEW

### Summary
Enhanced `orchestrator.mjs` to generalize `replan` recovery for tasks where implementation is blocked by missing file allowlist paths and required database schema/migrations, in accordance with the project owner's authorization.

### Key Changes
1. **Error Pattern**: Updated `replan` error detection in `.ai-collab/orchestrator.mjs` to match both allowlist exclusion and schema/authorized files limitation messages (`/^codex: .*(?:exact path allowlist excludes|cannot be implemented within the authorized files)/i`).
2. **Review & Runner Allowlist**: Added `.ai-collab/tasks/orchestrator-schema-replan-recovery/REVIEW.md` to accepted review paths and task artifacts to runner upgrade paths.
3. **Task Metadata Compatibility**: Updated uncommitted changes check in `replan` to include modern quota-optimization metadata artifacts (`IMPLEMENTATION_BRIEF.md`, `IMPLEMENTATION_SUMMARY.md`, `VERIFY_REPORT.md`, `REWORK.md`).
4. **Planning Repository Index**: Added `supabase` to `git ls-files` search paths in `planningContext()` so local schema migrations are known to planning prompts.
5. **Planning Path Guidance**: Added explicit prompt guidance when `checkpoint.approvedReplanPaths` is present to ensure planning CLI returns the approved revised paths.
6. **Integration Test Suite**: Added test coverage in `.ai-collab/orchestrator.integration.test.mjs` for schema/allowlist replan recovery.
