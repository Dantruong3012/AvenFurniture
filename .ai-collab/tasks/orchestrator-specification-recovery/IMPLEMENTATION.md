# Implementation: orchestrator-specification-recovery

Status: VERIFIED_PRE_COMMIT
Developer: Antigravity / Codex
Blocked base HEAD: faa3459a1befe97fcc7150aebd04151837fdf522
Task: cart-sync

Evidence:
- Implemented `recoverSpecification()` in `.ai-collab/orchestrator.mjs` handling `BLOCKED / PLANNING / MISSING_SPECIFICATION`.
- Added support for CLI arguments `recover-specification` and `recover-missing-specification`.
- Added regression tests in `.ai-collab/orchestrator.integration.test.mjs` covering:
  - Successful recovery adopting approved plan and transitioning to READY.
  - Archiving original blocked implementation artifact to `.runtime/`.
  - Rejection of second recovery call to prevent infinite loop.
  - 8 rejection checks: missing-plan, unapproved-plan, unapproved-review, wrong-plan-digest, extra-history, missing-receipt, dirty-source, staged.
- Verified all 9 new integration tests and entire test suite (207 npm tests) pass cleanly.
- Updated documentation in `.ai-collab/README.md`.
