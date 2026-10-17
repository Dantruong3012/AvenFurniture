# Plan: release-m4-github-ci

Status: APPROVED

# Task Plan: release-m4-github-ci

## Goal
Provide a robust GitHub API adapter supporting PR reconciliation, CI status checks synchronization, and automated changelog generation without requiring production credentials or live GitHub mutations in test environments.

## Acceptance Criteria
1. **GitHub API Adapter & Types (`lib/github/types.ts`, `lib/github/client.ts`)**:
   - Clean abstraction around GitHub REST API endpoints with authentication via personal access token / GitHub Actions token (`GITHUB_TOKEN` environment variable).
   - Safe fetch handling, structured response types, rate limit handling, and configurable retry/backoff.
2. **PR Reconciliation (`lib/github/reconciliation.ts`)**:
   - Query and reconcile open and merged PRs against local/task state, branch refs, and associated metadata.
   - Filter PRs by milestone, labels, target branch, and author.
3. **CI Status Checks Synchronization (`lib/github/status-checks.ts`)**:
   - Fetch and summarize commit statuses and check runs (success, pending, failure, neutral).
   - Validate prerequisite check suites before release readiness.
4. **Changelog Generation (`lib/github/changelog.ts`)**:
   - Generate conventional changelog entries grouped by PR type (`feat`, `fix`, `refactor`, `perf`, `docs`, etc.) from merged pull requests between tags or commit ranges.
5. **Unit and Integration Tests (`tests/github-ci.test.mjs`)**:
   - Complete unit and mock-based integration tests verifying client authentication, PR parsing/reconciliation, check status aggregation, error conditions, and changelog markdown generation.
   - Ensure all tests pass under Node test runner without external network dependencies.

## Proposed File Ownership Allowlist
- `lib/github/types.ts` (New)
- `lib/github/client.ts` (New)
- `lib/github/reconciliation.ts` (New)
- `lib/github/status-checks.ts` (New)
- `lib/github/changelog.ts` (New)
- `tests/github-ci.test.mjs` (New)

## Verification Strategy
- Run `node --test tests/github-ci.test.mjs`.
- Run TypeScript typecheck (`npx tsc --noEmit`).
- Verify no environment leakage or production calls during tests.

Owned paths: lib/github/client.ts, lib/github/reconciliation.ts, lib/github/status-checks.ts, lib/github/changelog.ts, lib/github/types.ts, tests/github-ci.test.mjs
