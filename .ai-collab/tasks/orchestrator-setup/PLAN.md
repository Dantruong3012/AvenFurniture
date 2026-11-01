# Plan: orchestrator-setup

Status: APPROVED
Planner: Antigravity CLI
Conversation: 3e7db871-c224-4524-818a-33fa02383822
Authorization: Explicit user request to complete and locally commit the orchestrator setup.

Approved implementation plan for orchestrator setup task

## Approved design

Implementation plan for unattended multi-agent orchestrator setup, coordinating sequential Antigravity planning/review and Codex implementation/testing with strict file isolation, independent verification, and fixed git execution.

## Owned paths

- `AGENTS.md`
- `.ai-collab/README.md`
- `.ai-collab/workflow.mjs`
- `.ai-collab/orchestrator-core.mjs`
- `.ai-collab/orchestrator.mjs`
- `.ai-collab/orchestrator.config.json`
- `.ai-collab/dry-run.mjs`
- `.ai-collab/orchestrator.test.mjs`
- `.ai-collab/orchestrator.integration.test.mjs`
- `.ai-collab/.gitignore`
- `.ai-collab/tasks/orchestrator-setup/PLAN.md`
- `.ai-collab/tasks/orchestrator-setup/IMPLEMENTATION.md`
- `.ai-collab/tasks/orchestrator-setup/REVIEW.md`

## Acceptance criteria

- All specified files in owned_paths exist and implement core orchestration, validation, and configuration contracts.
- Orchestrator core (.ai-collab/orchestrator-core.mjs) correctly handles lock acquisition, lock release, and stale lock detection.
- Queue processing correctly reads backlog, verifies dependencies, and identifies next-ready tasks without modifying BLOCKED tasks (including inquiry-service-layer).
- Independent verification suite passes (unit tests in orchestrator.test.mjs and integration tests in orchestrator.integration.test.mjs).
- Dry run (.ai-collab/dry-run.mjs) demonstrates a complete end-to-end simulated run across all lifecycle states without bypassing sandbox or mutating git history.
- Isolated safe task verification passes completely before marking orchestrator-setup as READY_FOR_REVIEW.
- No remote git push, secret exposure, production migration, or unowned file modifications occur.

## Execution clarification

The user explicitly requires real CLI invocations and a real local commit in an isolated proof repository. The planner wording “simulated” and “without mutating git history” therefore refers to protecting the original application repository during the proof, not replacing the real CLI calls or fixture commits. The supported proof command is `node .ai-collab/dry-run.mjs`; no task flag is needed.

## Safety and verification

- Preserve all preexisting backlog, state, and inquiry artifacts; do not clear the transaction blocker.
- No push, Production writes/deployment/migration, secrets changes or permission-bypass flags.
- Single coordinator lock, bounded timeout, maximum three implementation/review rounds, persisted stop/resume checkpoints.
- Structured agent output plus independent checks, scoped snapshot validation, staged-secret scan, and exact commit parent/tree verification.
- Run orchestrator unit/integration tests, real isolated CLI proof, and application lint/typecheck/tests/build.
- Obtain actual Antigravity review approval before the local setup commit.
