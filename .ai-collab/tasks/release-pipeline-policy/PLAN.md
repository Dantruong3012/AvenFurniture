# Plan: release-pipeline-policy

Status: APPROVED
Planner: Antigravity
Scope approval: APPROVED
Proposal date: 2026-10-31
Source receipt: .ai-collab/.runtime/release-readiness-20261031/policy.receipt.json

This proposal came from an actual sandboxed, read-only Antigravity CLI invocation. Its structured result is BLOCKED / OWNER_POLICY_DECISION. It is not an approved implementation plan or a code review. Owner decisions below are pending.

# Release Pipeline Policy Proposal & Owner Decisions

**Status**: REVISED / Awaiting Repository Owner Decisions
**Current Branch HEAD**: `8a267eeb7cff6a7246927c444d7466c10f35d181` (`dev/aven-autonomous-backlog`)
**Base Target**: `7454ca2eacb6185ca3611159d80c0aadf1cd9cd1` (`main`)
**Coordinator Lock Status**: IDLE (no active `.ai-collab/.lock`)
**Scope**: `release-pipeline-policy` (Task 1/3 in Release trilogy: `release-pipeline-policy` -> `release-pr-ci` -> `release-merge-tracking`)

---

## 1. Executive Summary & Gaps Identified

A remote audit confirmed:
1. `main` has no branch protection rules, required status checks, or rulesets enabled (`protection.enabled: false`).
2. GitHub repository has **0 workflows** (`total_count: 0`), and the local repo currently lacks a `.github` directory.
3. Merging into `main` automatically triggers Vercel Production deployment via GitHub git-integration (`productionBranch: main`, `autoAssignCustomDomains: true`, targets `aven-furniture.vercel.app`).
4. Vercel project targets Preview and Production, both historically sharing Supabase instance `eofdtqnnqgxaoykcbfrv`.
5. Existing code in `lib/github/controlled-merge.ts`, `lib/github/status-checks.ts`, and `lib/vercel/deployment.ts` has structural gaps:
   - `ControlledMergeAdapter.mergePullRequest` does not accept merge method parameters or capture the resulting merge commit SHA.
   - `ControlledMergeAdapter.getGitValidation` is an ad-hoc placeholder lacking commit-level tree and fast-forward/divergence checking against remote GitHub APIs.
   - `observeProductionDeployment` in `lib/vercel/deployment.ts` queries legacy `/v6/deployments` with a hardcoded limit and fallback polling, whereas `.ai-collab/release/OPERATIONS.md` establishes that Vercel uses `/v7/deployments` with `projectId`, `sha`, `branch`, and `target` filters, `/v9/projects/{id}`, and `/v13/deployments/{id}`.
   - `release.config.json` is correctly set to `"enabled": false` and `"releaseMode": "manual"`.

Autonomous self-approval, auto-merge, direct Production deployment, and unstaged/unauthorized schema or environment mutations are strictly forbidden by policy.

---

## 2. Release Policy Specifications

### A. PR Creation and Reconciliation (`dev/aven-autonomous-backlog` -> `main`)
- PR base branch: `main` (current SHA: `7454ca2eacb6185ca3611159d80c0aadf1cd9cd1`).
- PR head branch: `dev/aven-autonomous-backlog` (current SHA: `8a267eeb7cff6a7246927c444d7466c10f35d181`).
- Strict matching: PR head SHA must match expected target SHA exactly. Reconciliation must abort if the remote branch receives newer commits not accounted for in planning.

### B. CI Workflows & Status Checks
Because no GitHub Actions exist currently, the policy establishes required CI checks with exact names matching GitHub status check contexts:
1. `lint` (`npm run lint` / ESLint 9)
2. `typecheck` (`npm run typecheck` / `tsc --noEmit`)
3. `unit-pglite-integration` (`node --test tests/*.test.mjs` using `@electric-sql/pglite`)
4. `local-fixture-e2e` (`npx playwright test` using local fixtures and test mocks; **no** live shared DB mutations)
5. `build` (`npm run build` / Next.js production build)
6. `security` (Secret detection, Git blob scan, dependency vulnerability check)

### C. Approval Hierarchy & Stale Invalidation
- **Separation of Concerns**: Antigravity architectural review is completely separate from human GitHub pull request review. Antigravity approval never satisfies the GitHub human approval requirement.
- **Minimum Human Reviews**: Recommend **1 independent human approval**.
- **Stale Invalidation**: Dismiss stale PR approvals automatically when new commits are pushed to `dev/aven-autonomous-backlog`.
- **Prohibition of Self-Approval & Bypass**: No agent, bot token, or runner may approve its own PR or bypass protection rules.

### D. Manual Merge Strategy & History Preservation
- **Strategy**: Standard **Merge Commit** (`--no-ff`).
  - *Rationale*: Existing branch history on `main` contains merge commits; squashing or rebasing would rewrite SHA provenance and invalidate Antigravity task commit receipts.
- **Merge SHA Capture**: Upon merge, the resulting merge commit SHA on `main` must be captured and permanently recorded alongside the head SHA and PR number.

### E. Vercel Auto-Deployment & Production Guardrails
- **Critical Risk**: Merging into `main` immediately triggers a Vercel Production deployment if git-hooks/auto-deploy is active.
- **Verification Rule**: Auto-deployment settings, permissions, and deployment aliases (`aven-furniture.vercel.app`, `aven-furniture-dantruong.vercel.app`, `aven-furniture-git-main-dantruong.vercel.app`) must be verified **prior** to merging, not after.
- **Secret & Database Safety**:
  - Keep shared Supabase intact; zero staging DB or schema mutations.
  - No database reverse migration; rollback strategy is strictly forward-fix or rolling back code commit deployment with owner sign-off.
  - Vercel observer operations must be server/CLI only with read-only scoped tokens; zero Vercel credentials exposed to client bundles.

---

## 3. Explicit Owner Decisions Required

Before transitioning `release-pipeline-policy` out of `BLOCKED`, the repository owner must decide:

1. **GitHub Protection & Human Reviewer Assignment**:
   - Who is designated as the independent human approver for PRs into `main`?
   - Will the owner configure GitHub branch protection / ruleset on `main` with `enforce_admins: true`, dismissing stale approvals on push, and requiring the 6 CI check contexts?
2. **Vercel Production Auto-Deploy Behavior**:
   - Should `main` merges continue automatically deploying to Vercel Production (`dpl_*` promotion), or should Production deployments require manual promotion via Vercel CLI/Dashboard?
3. **Merge Commit Method Confirmation**:
   - Confirm merge strategy as "Create a merge commit" (no rebase, no squash) to preserve commit SHAs.

---

## 4. Handoff for Downstream Tasks (Post-Approval)

Once the owner approves this policy:
1. **Task 2: `release-pr-ci`**:
   - Introduce `.github/workflows/ci.yml` covering `lint`, `typecheck`, `unit-pglite-integration`, `local-fixture-e2e`, `build`, and `security`.
   - Update `lib/github/` client and status check helpers to query GitHub Actions Check Runs and Commit Statuses deterministically.
   - Ensure deferred email tasks (`email-delivery-policy`, `email-provider-adapter`, `outbox-scheduler`, `outbox-admin-retry`) remain untouched in `BACKLOG.md`.
2. **Task 3: `release-merge-tracking`**:
   - Update `lib/github/controlled-merge.ts` adapter contract to handle merge commit creation and return merge SHA.
   - Modernize `lib/vercel/deployment.ts` from `/v6` to `/v7` list and `/v13` deployment endpoints, keeping observation strictly read-only and server-side.
   - Record durable release audit receipts in `.ai-collab/.runtime/releases/<sha>.json` without modifying `.ai-collab/orchestrator.mjs` runner internals.

## Owner decision, 2026-10-31

The owner approved the proposed policy for local implementation, no merge/deploy, then explicitly delegated decisions to Codex and instructed it to stop Antigravity CLI calls. This supersedes the earlier OWNER_POLICY_DECISION blocker and the Antigravity invocation requirement for these three local tasks. No independent review is claimed. Final policy: docs/release-policy.md. The independent human reviewer remains unassigned and blocks remote merge. Production actions retain separate explicit approvals. Original Antigravity proposal and private receipt are preserved above.

Owned paths: docs/release-policy.md
