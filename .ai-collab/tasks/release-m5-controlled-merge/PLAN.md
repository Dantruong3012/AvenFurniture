# Plan: release-m5-controlled-merge

Status: APPROVED

### Goal
Implement a controlled merge coordinator that validates branch protection rules, verifies signed authorization payloads/tokens, and executes merge validation checks prior to triggering pull request merges.

### Acceptance Criteria
1. `lib/github/types.ts` is updated with necessary types for merge authorizations, branch protection status, and merge validation results.
2. `lib/github/controlled-merge.ts` provides functions to:
   - Validate signed merge authorization tokens/signatures (HMAC/crypto-based signature verification against authorized actors and target PR/commit).
   - Enforce branch protection policies (verifying target branch protections, required passing status checks, required reviews, and linear history constraints).
   - Execute pre-merge validation (ensuring branch is up to date, tree is clean, and required check suites pass).
   - Provide a safe merge coordination routine returning clear failure/rejection reasons or success.
3. Unit tests in `tests/github-controlled-merge.test.mjs` thoroughly cover:
   - Valid vs invalid signatures/tampered authorization payloads.
   - Branch protection violations (unmet approvals, missing required checks).
   - Passing merge coordination flows with simulated GitHub API responses.
4. No production database mutations or external production deployments required; changes are fully isolated to application library and unit tests.

Owned paths: lib/github/controlled-merge.ts, lib/github/types.ts, tests/github-controlled-merge.test.mjs
