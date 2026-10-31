# Workflow state

Active task: release-pr-ci
Current phase: BLOCKED
Last completed task: release-pipeline-policy
Next task: -
Blockers: new Inquiry source needs exact-SHA dev Push approval and fresh CI/Preview; shared WAF rate limit needs scoped live approval/read-back; authenticated/MFA acceptance and alert delivery unverified; exact-SHA Merge/Production auto-deploy authorization absent
Last successful commit: eedc8a8990da5e46e981604c21dd667e8ed48c30

Current handoff: [migration postflight](../docs/production-migrations-waiver-preflight.md) and [Inquiry admission/next approval](../docs/inquiry-release-admission.md). Owner explicitly approved exact SQL packet SHA256 12d5154f2409e9dcecdfc090e5540118df228685d9685fba4740ca6e5ed5bfd0 for project eofdtqnnqgxaoykcbfrv. Applied once via Management SQL API, one transaction, HTTP201. Read-only postflight confirms15 versions, all10 source hashes, complete rehearsed schema, Auth config/RLS/RPC grants and unchanged aggregate counts. No retry, reset, seed, secret/Auth config change or additional SQL write. Backup waiver includes known Auth/MFA inventory; do not ask for it again. Missing migrations in this batch are no longer a blocker.

Codex-only Solo main protection verified: required PR, approvals0, six strict Actions/App15368 checks and admin/conversation protections remain. PR #1 Ready, remote HEAD eedc8a8990da5e46e981604c21dd667e8ed48c30, BASE/main7454ca2eacb6185ca3611159d80c0aadf1cd9cd1, old revision6/6 green and Preview READY. No remote Git write this turn. Production still dpl_9whkyD1hL2HYVsxuyR2zNXvjR1Ge at full BASE/main SHA; auto-deploy on main is enabled. No merge/deploy approval, signing authorization, actual rollback or authenticated acceptance claimed.

Local Inquiry correction enforces256KiB streamed JSON and per-process10/minute admission with bounded ephemeral client buckets. All250 application/SQL tests,167 runner tests and42 fixture E2E pass; lint (two pre-existing warnings), typegen/typecheck, production build, tracked security scan and dependency gate pass (16 moderate, zero high/critical). Cross-instance anti-spam is not certified: active WAF config GET404 Config not found; no firewall write made. See the concrete10/IP/60s edge-rule proposal before approving its live activation.

No Antigravity, Orchestrator code/config/checkpoint changes or new workflow. All four Email tasks deferred. This is a current pointer, not a replacement for historical receipts; remote acceptance remains BLOCKED until the new revision and release gates pass.
