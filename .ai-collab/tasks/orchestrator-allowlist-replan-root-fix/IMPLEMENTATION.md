# Implementation: orchestrator-allowlist-replan-root-fix

Status: READY_FOR_REVIEW

### Summary
Implemented automatic in-flight replanning, structured allowlist blocker detection, and generalized allowlist replan recovery preserving partial implementation code.

### Key Changes
1. **Structured Schema**: Added `code` and `requestedPaths` properties to `schema` and `validateResult` in `.ai-collab/orchestrator-core.mjs`.
2. **Blocker Recognition**: Exported `isAllowlistBlocker()` to reliably identify allowlist and authorized file limitations across both structured codes and text summaries while excluding schema architecture constraints.
3. **In-Flight Replan**: Added automatic in-flight replanning in `orchestrator.mjs` during `IN_PROGRESS` phase, prompting Antigravity to review and approve safe path additions up to 2 times without losing progress.
4. **Code Preservation in Replan**: Updated `replan` checks in `orchestrator.mjs` so working code already authored by Codex in authorized paths is permitted and rebased cleanly into checkpoint baseline.
5. **Runner Review Gate**: Added `.ai-collab/tasks/orchestrator-allowlist-replan-root-fix/REVIEW.md` and associated task files to authorized replan recovery paths.
6. **Test Coverage**: Added unit tests in `orchestrator.test.mjs` and integration test in `orchestrator.integration.test.mjs`.
