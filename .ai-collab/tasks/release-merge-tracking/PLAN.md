# Plan: release-merge-tracking

Status: APPROVED
Planner: Codex under owner-delegated local decisions, 2026-10-31
Dependency: release-pr-ci; remote activation remains blocked until its live acceptance passes

Prepare and verify local merge preflight/tracking after the CI implementation passes local checks. Do not execute a merge or activate a remote release while release-pr-ci remains BLOCKED on live GitHub prerequisites. The owner explicitly stopped Antigravity CLI calls; no independent review is claimed. Unattended orchestrator gates are unchanged.

Use the existing GitHub client, check summaries, signed merge validator and server-side Vercel observer. Bind short-lived merge authorization to repository, PR, full head/base SHA, branch and explicit Production impact. Require protected main, strict required contexts, stale dismissal/admin enforcement, independent current human approvals and a clean/up-to-date PR. Return resulting merge SHA; reconcile unknown writes, never retry automatically. The operator CLI exposes PR reconciliation, read-only status, and merge preflight, with no merge/deploy command. Modernize Vercel reads and verify actual project/repository/branch/merged SHA and Production alias. Keep observation separate from successful health and approval.

Persist sanitized append-only local observations and distinguish CI Passed, Merge Approved, Merged, Deployment Pending, Deployed, Deployment Failed, Rolled Back and unavailable/drift states. Add negative tests for stale authorization/reviews/checks, wrong project/target/alias/SHA, failed and unknown merges, and rollback provenance. Document operational commands, independent reviewer/auth/protection prerequisites and the live inactive Supabase blocker. No email, Production writes or orchestrator activation.

Owned paths: lib/github/client.ts, lib/github/controlled-merge.ts, lib/github/types.ts, lib/github/release-tracking.ts, lib/vercel/deployment.ts, lib/vercel/types.ts, scripts/release.mts, tests/github-controlled-merge.test.mjs, tests/release-tracking.test.mjs, tests/release-cli.test.mjs, tests/vercel-deployment.test.mjs, tsconfig.json, package.json, docs/release-operations.md, docs/production-readiness-2026-10-31.md
