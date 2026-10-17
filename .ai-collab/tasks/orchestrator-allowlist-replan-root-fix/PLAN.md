# Plan: orchestrator-allowlist-replan-root-fix

Status: APPROVED
Planner: Antigravity
Task: orchestrator-allowlist-replan-root-fix

### Objective
Enhance the orchestrator with automatic in-flight replanning, structured allowlist blocker detection, and generalized allowlist replan recovery that preserves partial implementation code within authorized task paths.

### Acceptance Criteria
1. **Structured Blocker Contract**: Extend agent structured output schema to support optional machine-readable blocker `code` (e.g. `ALLOWLIST_EXCLUDED`) and `requestedPaths`.
2. **Robust Blocker Recognition**: Export `isAllowlistBlocker()` recognizing structured codes and standard allowlist exclusion messages, while strictly distinguishing architecture constraint blockers.
3. **Automatic In-Flight Replan**: During implementation, automatically invoke Antigravity Planning to evaluate and approve safe file path expansions when Codex encounters an allowlist blocker, bounded to a maximum of 2 auto-replans.
4. **Preserve Partial Implementation Code**: Ensure `replan` allows working code already produced by Codex in task-owned paths without failing the dirty working tree or application source changed checks.
5. **Reviewed Runner Gate**: Replan strictly verifies committed Antigravity `APPROVED` review under `.ai-collab/tasks/orchestrator-allowlist-replan-root-fix/REVIEW.md` or existing replan review paths.
6. **Automated Verification**: Provide comprehensive unit and integration tests verifying schema validation, blocker recognition, in-flight recovery, and test-suite integrity.

Owned paths: .ai-collab/orchestrator-core.mjs, .ai-collab/orchestrator.mjs, .ai-collab/orchestrator.test.mjs, .ai-collab/orchestrator.integration.test.mjs, .ai-collab/README.md, .ai-collab/tasks/orchestrator-allowlist-replan-root-fix/PLAN.md, .ai-collab/tasks/orchestrator-allowlist-replan-root-fix/IMPLEMENTATION.md, .ai-collab/tasks/orchestrator-allowlist-replan-root-fix/REVIEW.md
