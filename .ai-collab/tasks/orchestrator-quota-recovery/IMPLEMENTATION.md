# Implementation: orchestrator-quota-recovery

Status: APPROVED
Authorization: Direct user request to improve quota handling. Antigravity's final `REVIEW.md` is `APPROVED` and authorizes the runner upgrade commit.
Commit hash: -

## Changes

- Classify `RESOURCE_EXHAUSTED` and individual quota errors from Antigravity process output and JSON envelopes. Persist `PAUSED_QUOTA`, the interrupted phase, and the reported reset time without consuming an implementation/review round.
- Refuse automatic retries before the reset time. If no reset time is provided, require `resume --quota-ready`. A quota resume completes only the paused task before stopping the queue.
- Provide `recover-quota` for a legacy generic-exit `BLOCKED` checkpoint. It requires the saved failed log, keeps a private copy of the overwritten generic implementation artifact, restores the prior implementation artifact from Git, and leaves review evidence untouched.
- Permit a paused planning checkpoint to adopt a committed update limited to the enumerated runner files, after checking Git ancestry, dirty paths, and task source. This protects the current checkpoint from the runner changes made to fix it.
- Remove the repository-wide file list from planning context. Review now receives only the task plan, implementation report, task-owned tracked diff and full content for task-owned new files, with a 60,000-character cap.
- Document the pause, recovery and resume commands in AGENTS.md and `.ai-collab/README.md`.

## Antigravity feedback addressed

- `resume --quota-ready` now permits an operator-verified early retry even when the saved `retryAt` is in the future. Without the flag, early resume remains blocked; when no reset time is known, the flag is mandatory. The saved `retryAt` is left intact. A fresh 429 returns the task to `PAUSED_QUOTA`.
- Added the quota-recovery `REVIEW.md` to the runner upgrade allowlist. Adoption additionally requires that this file be present in the intervening commit, marked `Status: APPROVED` and attributed to Antigravity. The earlier `CHANGES_REQUESTED` review could not authorize adoption.
- Runner adoption validates the committed path list, review, Git ancestry, dirty paths, task source, config and staged index before changing the checkpoint. A failed preflight leaves the checkpoint byte-for-byte unchanged.
- A runner commit containing the paused task's `BACKLOG.md` or `STATE.md` is rejected. Those existing working changes must remain outside the later reviewed runner commit. Committed or uncommitted application source changes are also rejected.

## Verification

- `node --test .ai-collab/orchestrator*.test.mjs`: 24/24 passed. Regression cases cover early resume with and without the flag, missing reset time, repeated 429, approved and rejected review artifacts, committed `BACKLOG.md`/`STATE.md`, committed or dirty application source, and checkpoint preservation on failed preflight.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: 43/43 passed.
- `npm run build`: passed; 22 pages generated.
- `git diff --check`: passed.

## Current checkpoint

The real `inquiry-service-layer` checkpoint was reclassified from legacy `BLOCKED` to `PAUSED_QUOTA` by `recover-quota` after checking the saved `RESOURCE_EXHAUSTED (429)` log. It remains at `PLANNING`, round 0, with no review receipt or task commit. The saved log and checkpoint remain in ignored `.ai-collab/.runtime/`; the generic error artifact was archived there and the previous implementation text restored from the last commit. No Antigravity CLI was called during recovery. The reset time recorded from the log is `2026-10-17T09:54:16.655Z` (16:54:16 on 17 October in Vietnam).

The approved runner commit contains only the nine reviewed runner files and quota-recovery artifacts, including `REVIEW.md`; the paused inquiry `BACKLOG.md` and `STATE.md` modifications remain in the working tree. After this commit, `node .ai-collab/orchestrator.mjs resume` can adopt the runner update and retry the paused planning call after the saved reset time. An operator who separately verifies CLI availability may use `resume --quota-ready` earlier. No resume was attempted on the real checkpoint during this revision. If quota remains exhausted, the task pauses again. Production migration and deployment remain separate approvals.

## Scope

No application source, database, credentials, existing review artifact, or Production environment was changed. No task was marked DONE. No push or deploy occurred.
