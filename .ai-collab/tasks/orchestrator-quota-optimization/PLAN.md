# Plan: orchestrator-quota-optimization

Status: APPROVED
Planner: Antigravity CLI
CLI conversation: 841cae24-c09e-48b6-92d3-0a76d0bca9f9
Planning result: APPROVED, comprehensive quota and responsibility redistribution plan

## Objective

Refactor the AvenFurniture Multi-Agent Orchestrator to optimize token and quota usage, eliminate redundant Codex invocations, enforce strict responsibility separation, and establish structured, compact agent handoffs.

## Architectural Design

### 1. Responsibility Redistribution
- **Antigravity (Lead Architect & QA/Reviewer)**:
  - Planning and task decomposition with exact file allowlists.
  - Generates compact `IMPLEMENTATION_BRIEF.md`.
  - Investigates verification failures using filtered `VERIFY_REPORT.md`.
  - Formulates root-cause analysis and actionable `REWORK.md` for targeted fixes.
  - Performs independent code, architecture, and security reviews.
- **Codex (Implementation Specialist)**:
  - Implements changes strictly within authorized paths from `IMPLEMENTATION_BRIEF.md` (or `REWORK.md` during rework).
  - Produces structured output creating `IMPLEMENTATION_SUMMARY.md`.
  - Does NOT routinely explore full repository, run entire test suites repeatedly, parse giant build logs, or execute Git commit sessions.
- **Orchestrator (Deterministic Automation)**:
  - Task queue management and state transitions.
  - Deterministic test execution and log preservation to local disk.
  - Log filtering, summarization, and error deduplication for `VERIFY_REPORT.md`.
  - Deterministic Git staging, secret scanning, and commit execution (eliminating the expensive Codex AI commit turn).
  - Telemetry tracking (input tokens, cached tokens, output tokens, tool calls, shell output volume, rework rounds, durations).
  - Configurable phase budgets and high-usage warnings.
  - Enforces maximum 3 rework rounds before marking task BLOCKED.

### 2. New Lifecycle Workflow
```
TASK QUEUE
  → ANTIGRAVITY PLAN (creates PLAN.md + IMPLEMENTATION_BRIEF.md)
  → CODEX IMPLEMENT (creates IMPLEMENTATION_SUMMARY.md)
  → ORCHESTRATOR VERIFY (preserves logs, creates VERIFY_REPORT.md)
  → ANTIGRAVITY DIAGNOSE / REVIEW
      ├── IF APPROVED:
      │     → ORCHESTRATOR COMMIT (deterministic, no Codex AI call)
      │     → NEXT TASK
      └── IF REJECTED / CHECKS FAILED:
            → ANTIGRAVITY REWORK REPORT (creates REWORK.md)
            → IF ROUND >= 3: BLOCKED with diagnostics
            → IF ROUND < 3: CODEX TARGETED FIX → ORCHESTRATOR RE-VERIFY → ANTIGRAVITY RE-REVIEW
```

### 3. Structured Compact Handoff Documents
- `IMPLEMENTATION_BRIEF.md` (Antigravity → Codex):
  Task objective, exact authorized files/modules, architecture context, interfaces/contracts, specific changes required, acceptance criteria, applicable constraints.
- `IMPLEMENTATION_SUMMARY.md` (Codex → Antigravity):
  Files modified, behavior implemented, tests added/modified, known limitations, questions requiring review.
- `VERIFY_REPORT.md` (Orchestrator → Antigravity):
  Test command, exit code, failed test names, relevant error excerpts, file and line references, references to full local logs.
- `REWORK.md` (Antigravity → Codex on failure):
  Exact failure, root-cause analysis, required correction, relevant files, expected result.

### 4. Telemetry and Budgets
- Separate tracking for Antigravity and Codex:
  `inputTokens`, `cachedInputTokens`, `outputTokens`, `totalTokens`, `toolCalls`, `shellOutputBytes`, `durationMs`.
- Configurable budgets in `orchestrator.config.json` for exploration, implementation, diagnosis, review, rework.
- Output warnings when turns or cumulative task usage exceed budget thresholds.

### 5. Deterministic Commit
- When review is APPROVED and verification checks have passed, Orchestrator directly:
  1. Verifies tree is clean outside task-owned paths.
  2. Stages task paths and scans staged blobs for secrets.
  3. Writes git tree and executes local conventional commit.
  4. Records commit hash and updates metadata (`BACKLOG.md`, `STATE.md`).
  No LLM turn is invoked for committing.

## Acceptance Criteria

1. **Correct Agent Routing**: Orchestrator routes planning and diagnosis/review to Antigravity, implementation and rework to Codex, and test execution and Git commit to deterministic Orchestrator code.
2. **Compact Implementation Briefs**: Antigravity produces `IMPLEMENTATION_BRIEF.md`; Codex is provided focused context instead of broad repository dumps.
3. **Independent Verification & Log Filtering**: Orchestrator executes all checks, preserves full logs on disk, and extracts concise, deduplicated failure excerpts in `VERIFY_REPORT.md`.
4. **Review & Rework Loops**: On check failure or review change request, Antigravity diagnoses and produces `REWORK.md`; Codex executes targeted fixes.
5. **Maximum Retry Enforcement**: Exactly 3 rework rounds per task. If round exceeds 3, the task transitions to `BLOCKED`.
6. **Complete Local Log Preservation**: Full outputs of all commands are saved in `.ai-collab/.runtime/` for debugging.
7. **Reduced Redundant Shell Output**: No full log dumps passed into agent prompts; agents receive compact summaries.
8. **Checkpoint Recovery**: All checkpoints (`PLANNING`, `IN_PROGRESS`, `TESTING`, `READY_FOR_REVIEW`, `PAUSED_QUOTA`, `STOPPED`, `BLOCKED`) remain durable and recoverable.
9. **Backward Compatibility**: Existing task states, legacy recovery commands, and autopilot preflight remain functional.
10. **Safety and Approval Gates**: Security scans (`scanStaged`), secret redaction, path restrictions, and strict schema validation remain fully enforced.
11. **Telemetry & Benchmark**: Telemetry accurately records metrics including cached tokens, and a benchmark comparison proves quota optimization.

## Authorized File Ownership

- `.ai-collab/orchestrator-core.mjs`
- `.ai-collab/orchestrator.mjs`
- `.ai-collab/orchestrator.config.json`
- `.ai-collab/orchestrator.test.mjs`
- `.ai-collab/orchestrator.integration.test.mjs`
- `.ai-collab/dry-run.mjs`
- `.ai-collab/README.md`
- `.ai-collab/AUTOPILOT.md`
- `.ai-collab/tasks/orchestrator-quota-optimization/PLAN.md`
- `.ai-collab/tasks/orchestrator-quota-optimization/IMPLEMENTATION_BRIEF.md`
- `.ai-collab/tasks/orchestrator-quota-optimization/IMPLEMENTATION.md`
- `.ai-collab/tasks/orchestrator-quota-optimization/REVIEW.md`
