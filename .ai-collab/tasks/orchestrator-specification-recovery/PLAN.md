# Plan: orchestrator-specification-recovery

Status: APPROVED
Planner: Antigravity CLI (Lead Architect)

## Goal

Add official orchestrator recovery command `recover-specification` for tasks BLOCKED in PLANNING due to MISSING_SPECIFICATION (such as cart-sync).

## Acceptance Criteria

1. Verify checkpoint is BLOCKED at PLANNING, round 0, with original Planning receipt confirming MISSING_SPECIFICATION.
2. Require an approved task PLAN.md authored by Antigravity with Status: APPROVED and explicit Owned paths.
3. Validate owned paths strictly using validatePaths().
4. Enforce architectural constraints: guest localStorage, authenticated cross-device sync, cart merging upon login, no browser fingerprinting or IP tracking, no guest share token, no checkout or online payment.
5. Verify clean git index and exactly one reviewed runner commit after checkpoint base HEAD.
6. Verify committed runner review is marked APPROVED by Antigravity, binds reviewed base HEAD, reviewed task ID, and approved task plan digest.
7. Verify uncommitted working tree changes are confined to allowed task metadata.
8. Archive blocked implementation artifact to .ai-collab/.runtime/ and synthesize a valid Planning receipt.
9. Transition checkpoint to READY with clean baseline and runner upgrade recorded.
10. Fail closed on invalid inputs, missing plan, or retry to prevent infinite loops.

Owned paths: .ai-collab/orchestrator.mjs, .ai-collab/orchestrator.integration.test.mjs, .ai-collab/README.md, .ai-collab/tasks/orchestrator-specification-recovery/PLAN.md, .ai-collab/tasks/orchestrator-specification-recovery/IMPLEMENTATION.md, .ai-collab/tasks/orchestrator-specification-recovery/REVIEW.md
