# Implementation: task&#45;autopilot-run-quota-ready

Status: READY_FOR_REVIEW
Developer: Codex
Base HEAD: 459c3976cb775d8d19543990a6c23df222aae73d
Commit: pending review

The launcher now accepts an explicit operator `npm run ai:auto -- run --quota-ready` for the currently paused task. `assessQueue` maps `PAUSED_QUOTA` to `RESUME` only with the flag (or after a known reset time), and the launcher forwards the flag only for a paused coordinator resume. With no flag and an unknown/future reset, it stays paused. Existing branch, remote, credential and lock guards remain ahead of this decision; the launcher still requires exact-digest real two-CLI smoke proof before invoking the coordinator. The coordinator retains its independent checkpoint, Git baseline and path validation.

The tests cover null/future retry times, default pause, exact coordinator arguments and refusal of unsafe branch, remote, credential, lock or roadmap state. Operator documentation now includes the npm resume command and explains `COMPLETE` for an exhausted approved backlog.

Verification in this isolated runner worktree:

- `node --test .ai-collab/autopilot.test.mjs`: 13 passed.
- `node --test .ai-collab/*.test.mjs`: 127 passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: 103 passed.
- `npm run build`: passed with public/non-sensitive local environment variables.
- `git diff --check`: passed.

The real consultant checkpoint was resumed separately through the reviewed coordinator and reached DONE with Antigravity APPROVED, independent checks and local commits. Main is clean and its approved backlog currently reports COMPLETE. This launcher task changed no application source, database, Production environment, push or deployment.
