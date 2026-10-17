# Plan: orchestrator-deterministic-commit-and-external-credentials

Status: APPROVED
Planner: Antigravity CLI
CLI conversation: 841cae24-c09e-48b6-92d3-0a76d0bca9f9

Support deterministic orchestrator commit validation in release verification and safely load out-of-repo management credentials for one-command autonomous execution.

Acceptance criteria:
1. `verifyCompleted` in `.ai-collab/release-git.mjs` allows `agent: 'orchestrator'` commit receipts with matching parent, tree, and title.
2. `orchestrator.mjs` sets `exitCode: 0` and structured `details` for deterministic coordinator commits.
3. `loadManagementCredentials` in `.ai-collab/autopilot-core.mjs` safely resolves `process.env.AVEN_MANAGEMENT_ENV` or `~/.config/avenfurniture/management.env` without logging or leaking secrets to subprocesses.
4. `autopilot.mjs` invokes credential loading on startup so `npm run ai:auto` can authenticate Vercel and Supabase management APIs for preflight without credentials in `.env.local`.
5. Subprocess environments continue using `agentEnvironment()` to purge management secrets.
6. Real two-agent CLI smoke test passes cleanly in an isolated temporary Git fixture.
7. No application source, database, secret, Vercel environment, push, or Production deployment changes.

Owned paths:
- `.ai-collab/release-git.mjs`
- `.ai-collab/orchestrator.mjs`
- `.ai-collab/orchestrator.release.test.mjs`
- `.ai-collab/autopilot-core.mjs`
- `.ai-collab/autopilot.mjs`
- `.ai-collab/autopilot.test.mjs`
