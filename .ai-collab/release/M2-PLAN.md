# Plan: Milestone M2 — Preview Tracking & Verification

Status: APPROVED
Reviewer: Antigravity (Lead Architect)
Date: 2026-10-16

## 1. Goal & Scope
Implement the Vercel Preview Tracking adapter for the AvenFurniture Release Orchestrator, enabling automated verification of Git-triggered Preview deployments without creating manual duplicate builds or performing live database mutations.

## 2. Architecture & Components

### 2.1 Vercel Adapter (`.ai-collab/release-vercel.mjs`)
- **Transport**: Standard `fetch` with bounded timeout (`config.timeoutMs`) and sanitized error handling.
- **Authentication**: `VERCEL_TOKEN` provided via environment variable (or scoped from `.env.local`). Tokens are never logged, echoed, or included in error messages.
- **Core Operations**:
  1. `verifyProductionBranch({ token, projectId, expectedBranch })`:
     - Calls Vercel API `GET /v9/projects/{projectId}`.
     - Asserts `link.productionBranch === expectedBranch` (ensures `main` is the true production branch, not a dev branch).
  2. `findPreviewDeployment({ token, projectId, commitSha, branchName })`:
     - Calls Vercel API `GET /v6/deployments?projectId={projectId}&meta-githubCommitSha={commitSha}`.
     - Identifies the active deployment targeting `preview` with matching commit SHA and branch ref.
     - Rejects any production-targeted deployment.
  3. `pollDeploymentReady({ token, deploymentId, timeoutMs, pollIntervalMs })`:
     - Bounded polling loop with exponential backoff and jitter.
     - Returns `PREVIEW_READY` when `readyState === "READY"`.
     - Fails closed on `readyState === "ERROR"`, `CANCELED`, or timeout.
     - Redacts error outputs and suppresses private environment variable dumps.

### 2.2 Shared Database Safety Rules
- **Constraint**: Local, Preview, and Production share a single Supabase database instance.
- **Rules**:
  - Live Preview testing is restricted to **READ-ONLY probes** (catalog browsing, product detail rendering, image availability, cart UI, static routes).
  - Automated write mutations (submitting inquiries, mutating products, updating categories, creating users) against live Preview are **STRICTLY PROHIBITED**.
  - All write and role test scenarios must execute exclusively against local disposable PGlite database fixtures.

## 3. Implementation Plan for Codex

### Phase 1: Adapter Implementation
- Create `.ai-collab/release-vercel.mjs` exporting:
  - `validateVercelConfig(config)`
  - `createVercelClient({ token, projectId, timeoutMs })`
  - `verifyProjectConfiguration()`
  - `getDeploymentByCommit(sha, branch)`
  - `waitForDeploymentReady(deploymentId, options)`

### Phase 2: Orchestrator Integration
- Integrate Preview verification stage into `.ai-collab/release.mjs`:
  - Transition: `PUSHED` → `PREVIEW_DEPLOYING` → `PREVIEW_READY`
  - Stores durable release snapshot in `.ai-collab/.runtime/releases/{sha}.json`.

### Phase 3: Deterministic Test Suite
- Add comprehensive mock test cases in `.ai-collab/orchestrator.release.test.mjs`:
  - Verified production branch match vs. wrong branch rejection.
  - Correct preview deployment retrieval by exact commit SHA.
  - Handling of deployment `READY`, `ERROR`, `CANCELED`, and timeout states.
  - HTTP 429 rate-limiting backoff using `Retry-After`.
  - Token and credential redaction assertions.

## 4. Verification & Quality Gates
- `node --test .ai-collab/orchestrator.release.test.mjs`: PASS 100%
- `node --test .ai-collab/orchestrator*.test.mjs`: PASS 100%
- `npm run lint`: PASS
- `npm run typecheck`: PASS
- `npm test`: PASS
- `npm run build`: PASS
- `git diff --check`: PASS

Owned paths: .ai-collab/release-vercel.mjs, .ai-collab/release.mjs, .ai-collab/release.config.json, .ai-collab/orchestrator.release.test.mjs, .ai-collab/release/DESIGN.md, .ai-collab/release/OPERATIONS.md, .ai-collab/orchestrator.mjs

## Narrow planner revision — 2026-10-16

Antigravity CLI Planning decision: `APPROVED` (conversation `bd28e948-00bf-4ea7-b867-318633e8d8bf`). The revised exact ownership adds only `.ai-collab/orchestrator.mjs` so the coordinator can await `afterCompleted()` and `releaseCommand()` while holding its lock through Vercel Production Branch preflight, Git push, and Preview polling. Preserve fail-closed behavior, keep release disabled, and do not deploy Production, modify secrets, or write the database. Update release tests and operations docs for the async lock lifecycle. This revision stays within the approved M2 Preview tracking goal.
