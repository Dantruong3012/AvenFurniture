# Implementation: release-m4-github-ci

Status: READY_FOR_REVIEW
Changed paths: lib/github/client.ts, lib/github/reconciliation.ts, lib/github/status-checks.ts, lib/github/changelog.ts, lib/github/types.ts, tests/github-ci.test.mjs
Commit: feat(release-m4-github-ci): implement approved task
Commit hash: 789b51206a3009d4acee75aabd66c2f7c7446351

Implemented the GitHub REST adapter, PR reconciliation, CI check summaries, and conventional changelog generation.

Verification passed: `node --test tests/github-ci.test.mjs` (4/4), `npx tsc --noEmit`, and ESLint on all six authorized paths. The client supports optional `GITHUB_TOKEN` auth, injectable fetch and backoff, structured API errors, and paginated reads. Reconciliation filters PRs and matches local task/branch metadata; check summaries classify outcomes and validate required checks; changelog generation groups merged PRs by conventional title. No Git index changes were staged. Pre-existing `.ai-collab/` changes were preserved.

## Independent checks

- npm run lint: PASS
- npm run typecheck: PASS
- npm test: PASS
- npm run build: PASS
