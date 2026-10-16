# Implementation: orchestrator-release-m1

Status: READY_FOR_REVIEW
Implementer: Codex
Date: 2026-10-16

## Scope and architecture

User-authorized release infrastructure upgrade, milestone M1 only. The proposal and M1–M8 acceptance criteria are in `.ai-collab/release/DESIGN.md`; infrastructure findings are in `AUDIT.md` and operating instructions in `OPERATIONS.md`. Antigravity approved the final M1 delta through the real CLI; see REVIEW.md and its hash-bound receipt. M2–M8 are not implemented, and this is not end-to-end CI/CD readiness.

M1 archives immutable completion checkpoints, validates real coordinator review/commit/check receipts and Git trees, scans outgoing historical blobs, detects remote divergence, pushes an exact dev SHA, and independently verifies remote SHA. Repeated or interrupted pushes reconcile external state. Separate release state/events preserve development DONE on release failure. The existing shared lock retains unresolved network-operation markers after a crash/timeout. Defaults: disabled, manual. No actual GitHub push, PR, merge or deployment performed.

## Owned files

- `.ai-collab/README.md`
- `.ai-collab/dry-run.mjs`
- `.ai-collab/orchestrator-core.mjs`
- `.ai-collab/orchestrator.mjs`
- `.ai-collab/orchestrator.integration.test.mjs`
- `.ai-collab/orchestrator.release.test.mjs`
- `.ai-collab/release-git.mjs`
- `.ai-collab/release.mjs`
- `.ai-collab/release.config.json`
- `.ai-collab/release/AUDIT.md`
- `.ai-collab/release/DESIGN.md`
- `.ai-collab/release/OPERATIONS.md`
- This implementation artifact. The reviewer owns `REVIEW.md`.

Pre-existing BACKLOG.md, STATE.md, admin-inquiry-portal artifacts and its BLOCKED checkpoint are excluded. No application source, SQL migration, dependencies or environment settings changed. No run/resume/replan on the real checkpoint. Existing HEAD remains faab317e3410d45436944dd25314472da62ac422.

## Actual verification

- `node --test .ai-collab/orchestrator*.test.mjs`: PASS, 59 tests, 0 failures/skips.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm test`: PASS, 71 tests, 0 failures/skips.
- `npm run build`: PASS, Next.js 16.3.8 production build, 23 prerendered pages.
- `git diff --check`: PASS.
- `doctor`, `release-status`, legacy `status`: exercised read-only; release disabled, no fabricated historical completion receipt, current admin checkpoint still BLOCKED / IN_PROGRESS.

Regression tests use real commits and a bare local Git remote with an injected origin identity. They cover exact SHA success, duplicate avoidance, wrong origin/branch, dirty/staged files, failed checks/review, disabled mode, remote divergence, push failure, lost response, interruption/reconciliation, historical secret rejection, scanner self-scan false-positive regression, immutable receipt, unresolved network lock and release-import failure preserving completed development state. Fake review receipts are confined to isolated deterministic test fixtures; they do not approve this milestone. No real CLI dry-run or live GitHub push proof is claimed.

## Shared Supabase and approval boundaries

Operator confirms one shared project for Local/Preview/Production. Keep it. Live E2E must be read-only; test writes use mocks/disposable local infrastructure, with unavailable live coverage explicitly reported. No staging project creation. Read-only schema inspection confirms the admin status mismatch; AUDIT.md proposes reusing existing statuses without migration. The missing submit_customer_inquiry RPC remains a separate release gate requiring explicit SQL approval.

## Review handoff and activation blockers

Review receipt/tree validation, push identity/history/secret guards, interruption behavior, legacy coordinator regressions and shared-database safety. Review only these M1 paths; do not approve unrelated admin artifacts. Require actual Antigravity APPROVED before any commit. Do not expand runner upgrade allowlists or resume the blocked admin task to activate this work. Resolve its architecture and runner adoption separately or use a clean dedicated checkout. Missing GitHub API authentication/protection/CI and Vercel team access remain infrastructure prerequisites for later milestones.

## Post-review local commit record

Implementation commit: `1b17110d26309a8a0ba47caae0de869a2dff81bc`
Branch: `dev/aven-release-m1`
Isolated worktree: `/private/tmp/aven-release-m1`

Only the reviewed M1 code/docs and actual review artifact were committed. This metadata update records that commit; it does not change reviewed runner code. No push. The main checkout stays on `dev/aven-autonomous-backlog` at faab317 with its original dirty task metadata and BLOCKED checkpoint. Its BACKLOG.md and STATE.md were not staged, committed or updated by M1. M1 is not integrated into that checkpoint baseline; resolve the admin plan and separately reviewed runner adoption before activating. No overall release DONE/DEPLOYED claim.

## Post-commit fixture correction (awaiting supplemental review)

Scanning the full two-commit M1 history exposed a mistaken fixture name in the exact scanner exemption. It has been corrected to the existing fake value by concatenating its prefix and suffix in scanner source; no credential is involved. Three new regression cases prove the actual repository fixture is accepted, the same content in another path is rejected, and an arbitrary secret in the fixture path is rejected. The corrected scanner successfully inspected 2 actual commits / 179 unique path+blob combinations locally. Orchestrator suite now passes 59/59 tests; lint and diff checks pass. Application code is unchanged from the passing 71-test/typecheck/build evidence. No live push.
