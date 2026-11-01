# Plan: orchestrator-autopilot-setup

Status: APPROVED
Planner: Antigravity CLI
Planning result: READY, structured JSON, no denied actions
Date: 2026-10-16

The approved setup adds a one-command development launcher with read-only Vercel, Supabase and GitHub preflight, then uses the existing sequential Antigravity/Codex coordinator. It must preserve the current blocked admin checkpoint and all unrelated working changes. It must never push, deploy, migrate the shared database, or perform billing actions during setup.

Headless Antigravity planning and review receive bounded task context in a temporary empty working directory and use sandbox mode. A valid result requires a successful structured output with no denied actions; sandboxing alone does not prove tools are disabled.

Record actual CLI token usage when available. Write a private Markdown handoff under ignored `.ai-collab/.runtime/` after each lifecycle transition and when a conservative usage threshold, context limit, quota limit, stop, or blocker is reached. The handoff records task, phase, Git state, receipt references, and a safe next step without raw logs or credentials. Usage thresholds are warnings, not a claim to know remaining provider quota exactly.

Verify with deterministic orchestrator and launcher tests, lint, typecheck, application tests, build, and an isolated real-CLI Plan → Implement → Review → Commit smoke. Antigravity must review the final diff before a setup commit. No application source changes.

Owned paths: package.json, .ai-collab/autopilot.mjs, .ai-collab/autopilot-core.mjs, .ai-collab/autopilot.config.json, .ai-collab/autopilot.test.mjs, .ai-collab/orchestrator.mjs, .ai-collab/orchestrator-core.mjs, .ai-collab/orchestrator.test.mjs, .ai-collab/orchestrator.integration.test.mjs, .ai-collab/AUTOPILOT.md, .ai-collab/README.md

Planning evidence: `/private/tmp/aven-autopilot-planning/corrected-envelope.json` (local, private; not a repository artifact).
