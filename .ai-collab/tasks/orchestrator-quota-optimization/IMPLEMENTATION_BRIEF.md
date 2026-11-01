# Implementation Brief: orchestrator-quota-optimization

## Task Objective
Refactor the orchestrator runner and core modules to optimize token and quota usage across Antigravity and Codex:
1. Redistribute agent responsibilities so Codex handles only implementation and targeted rework, Antigravity handles planning and failure diagnosis/review, and Orchestrator handles test execution and commits deterministically.
2. Implement structured compact handoff documents (`IMPLEMENTATION_BRIEF.md`, `IMPLEMENTATION_SUMMARY.md`, `VERIFY_REPORT.md`, `REWORK.md`).
3. Add log filtering and summarization to avoid sending raw test/build logs to agents.
4. Add comprehensive telemetry tracking (including cached tokens, tool calls, shell output volume, and phase budgets).
5. Implement deterministic Git committing by the orchestrator (eliminating the Codex AI commit invocation).
6. Support maximum 3 rework rounds per task before transitioning to `BLOCKED`.

## Exact Authorized Files
- `.ai-collab/orchestrator-core.mjs`: Core utilities for token telemetry, budget checks, log summarization/filtering, handoff document helpers.
- `.ai-collab/orchestrator.mjs`: Orchestrator state machine (`PLANNING`, `IN_PROGRESS`, `TESTING`, `READY_FOR_REVIEW`, `APPROVED`, `COMMITTED`), deterministic commit execution, rework routing.
- `.ai-collab/orchestrator.config.json`: Configuration for budgets, deterministic commit.
- `.ai-collab/orchestrator.test.mjs`: Unit tests for telemetry, log summarization, budget checks, handoff documents.
- `.ai-collab/orchestrator.integration.test.mjs`: Integration tests for the new workflow, rework loop, retry limits, deterministic commits, and backward compatibility.
- `.ai-collab/dry-run.mjs`: Isolated fixture smoke verification updated to use the new workflow.
- `.ai-collab/README.md`: Documentation on new workflow, handoffs, and telemetry.
- `.ai-collab/AUTOPILOT.md`: Updated runner documentation.
- `.ai-collab/tasks/orchestrator-quota-optimization/IMPLEMENTATION.md`: Implementation record.

## Architecture Context & Interfaces
1. **Telemetry & Budgets** (`orchestrator-core.mjs`):
   - Enhance `agentTokenUsage(kind, output)` to extract `cachedInputTokens` (e.g. from `cached_input_tokens`, `prompt_tokens_details.cached_tokens`, etc.) and `toolCalls` if present.
   - Add `summarizeCheckOutput(output, command, logPath)`:
     Extracts failed test assertions, test names, file:line references; removes boilerplate and deduplicates repeated error lines.
   - Add budget check helper `evaluateBudget(telemetry, budgets)`.
   - Add handoff formatters for `IMPLEMENTATION_BRIEF.md`, `IMPLEMENTATION_SUMMARY.md`, `VERIFY_REPORT.md`, and `REWORK.md`.
2. **Workflow State Machine** (`orchestrator.mjs`):
   - `PLANNING`: Antigravity generates plan + brief. Orchestrator writes `PLAN.md` and `IMPLEMENTATION_BRIEF.md`.
   - `IN_PROGRESS`: Codex receives compact brief (or `REWORK.md` on round > 1). Codex outputs structured result with `summary`, `details`, `paths`. Orchestrator writes `IMPLEMENTATION_SUMMARY.md` and updates `IMPLEMENTATION.md`.
   - `TESTING`: Orchestrator executes checks. Writes full logs to disk. Generates `VERIFY_REPORT.md`. Transitions to `READY_FOR_REVIEW`.
   - `READY_FOR_REVIEW` (Diagnose / Review):
     If checks failed: Antigravity diagnoses the failure and outputs `CHANGES_REQUESTED` with root cause and actionable fixes (`REWORK.md`).
     If checks passed: Antigravity reviews diff, evidence, and verify report. Returns `APPROVED` or `CHANGES_REQUESTED`.
   - Rework routing: If `CHANGES_REQUESTED`:
     If `round >= maxRounds`: Mark task `BLOCKED`.
     Else: Increment round, transition to `IN_PROGRESS` (Codex targeted fix).
   - `APPROVED`: Deterministic commit!
     If `config.deterministicCommit !== false && config.commitAgent !== 'codex'`:
       Orchestrator validates state, stages task paths, scans for secrets with `scanStaged()`, commits directly with author identity, verifies commit tree, records commit. Codex is NOT invoked.
       If legacy mode (`config.commitAgent === 'codex'`), preserves legacy Codex commit request.
3. **Telemetry Persistence**:
   - Save telemetry record to `.runtime/telemetry.json` and in `checkpoint.telemetry`.

## Acceptance Criteria
- All 10 verification points pass.
- All existing tests in `orchestrator.test.mjs`, `orchestrator.integration.test.mjs`, `autopilot.test.mjs`, and `orchestrator.release.test.mjs` pass.
- A representative benchmark verifies quota optimization.
