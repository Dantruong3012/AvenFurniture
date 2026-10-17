# Plan: task&#45;autopilot-run-quota-ready

Status: APPROVED
Planner: Antigravity CLI
CLI conversation: 1354566d-bba6-4ef1-928f-b9aeaf11a111

The launcher currently reports a Codex `PAUSED_QUOTA` checkpoint but exits before invoking the coordinator, even when the operator has verified both CLIs and passes `npm run ai:auto -- run --quota-ready`.

Acceptance criteria:

1. An explicit `--quota-ready` maps the current paused checkpoint to `RESUME` even when `retryAt` is absent or future, and forwards that flag to `orchestrator.mjs resume`.
2. Without the flag, the launcher remains paused. No automatic retries or loops are added.
3. Existing branch, remote, credential, Git, task ownership, lock and real two-CLI smoke checks still apply before any agent execution.
4. Add regression tests for state mapping and exact coordinator argument forwarding. Document the operator command and its requirement for independent CLI availability proof.
5. No application source, database, secret, Vercel environment, push or Production deployment changes.

Owned paths: `.ai-collab/autopilot-core.mjs`, `.ai-collab/autopilot.mjs`, `.ai-collab/autopilot.test.mjs`, `.ai-collab/AUTOPILOT.md` and lifecycle artifacts in this task directory.
