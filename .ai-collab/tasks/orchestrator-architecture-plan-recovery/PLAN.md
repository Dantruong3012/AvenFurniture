# Plan: orchestrator-architecture-plan-recovery

Status: APPROVED
Planner: Antigravity CLI (Lead Architect)
Conversation ID: `1d9a280b-f1fe-45d3-80e8-51a13dbc020c`

## Goal

Fix the false-positive status validator and recover the already successful Antigravity Planning receipt for `admin-inquiry-portal`. The first architecture recovery reached `PLANNING`; receipt sequence 4 returned `READY` with the exact approved ten paths and a positive list of `new`, `consulting`, `completed`, `cancelled`. Its separate prohibition of old statuses triggered the runner's overly broad text check.

## Acceptance criteria

- Parse the affirmative inquiry-status list exactly. A negated sentence naming obsolete statuses must not fail a plan that positively declares the four approved statuses. A positive list containing an obsolete status must fail.
- Add `recover-architecture-plan` for the exact saved `BLOCKED`/`PLANNING` failure only. It must validate the successful saved Planning receipt, its unchanged content and source snapshot, exact approved ownership, Git ancestry and a reviewed runner-only fix commit, approved admin plan digest, clean index, and only expected task metadata in the working tree.
- Preserve all old receipts, prior checkpoint history, and the blocked implementation artifact in a private archive. No manual checkpoint edit, reset, stash, database action, environment change, or Production deployment.
- Adopt the verified receipt into the coordinator lifecycle, then transition to `READY`. A subsequent `resume` must enter the normal Codex implementation, independent checks, Antigravity review, and commit gates.
- Regression tests cover the false positive, successful receipt adoption/implementation in an isolated fixture, wrong receipt/path/digest/history, staged or unowned changes, and checkpoint preservation on validation failure.

Owned runner paths: `.ai-collab/orchestrator.mjs`, `.ai-collab/orchestrator.integration.test.mjs`, `.ai-collab/README.md`. `PLAN.md`, `IMPLEMENTATION.md`, and `REVIEW.md` here are lifecycle artifacts, not application source ownership.
