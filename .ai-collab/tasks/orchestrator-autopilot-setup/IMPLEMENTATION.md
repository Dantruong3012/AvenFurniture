# Implementation: orchestrator-autopilot-setup

Status: DONE
Implementer: Codex
Date: 2026-10-16
Implementation commit: da9290b

## Implemented

`npm run ai:auto` performs read-only Vercel, Supabase and GitHub preflight, validates branch/worktrees/backlog/checkpoint/lock, requires a real-CLI fixture proof before eligible work, and delegates normal task execution to the existing coordinator. It stops on the real admin `BLOCKED` checkpoint, dirty Git state, missing permissions, privileged credential files, or a failed smoke. It does not execute the actual backlog during setup and has no Production migration, deployment, billing, merge, or automatic push route.

Antigravity Planning and Review now run from a fresh empty temporary directory with only bounded task context, sandbox mode and structured JSON. Codex still runs in the scoped implementation checkout. The coordinator rejects denied actions, incomplete JSON envelopes, unowned edits and false approvals. A transient interrupted Antigravity stream is ignored and retried once after verifying unchanged Git/source; a second failure blocks safely. Planning uses low effort and Review medium effort to reduce excess token use.

The coordinator captures actual CLI per-turn usage when available, warns at 32,000 input, 8,000 output or 40,000 total tokens, and writes ignored `.ai-collab/.runtime/HANDOFF.md` after every transition and on quota exhaustion, warning, stop or blocker. The Markdown note contains task/phase/Git state/receipt filenames/last usage/next action; no raw prompt, model output or credential is copied. These thresholds are conservative warnings, not a claim that provider remaining quota or context can be measured exactly. A real 429 still pauses without busy retry; context-limit errors block with a handoff rather than being misclassified as architecture approval.

The model-driven subprocess environment strips management credentials; logs redact known token values. Since `.env.local` remains agent-readable, unattended task execution is blocked while privileged variable names are present there. Release automation remains disabled/manual; M2–M8 are separate tasks.

## Evidence

- Antigravity Planning returned a real structured `READY` result with the exact 11 owned code/documentation paths. The first result had incorrect documentation locations; a second bounded invocation corrected them. Private envelopes are under `/private/tmp/aven-autopilot-planning/`; the approved plan artifact is `PLAN.md` here.
- Deterministic launcher/orchestrator suite: **70/70 PASS**. Application suite: **71/71 PASS**. `npm run lint`, `npm run typecheck`, production build with only existing `NEXT_PUBLIC_*` values, and `git diff --check`: **PASS**.
- Direct real-CLI fixture proof: Antigravity Plan → Codex Implement → independent fixture checks → Antigravity Review APPROVED → Codex commit request → two local Git commits. Proof task `safe-proof` ended `DONE`; original repository source was unchanged. Fixture path and events are private under `/var/folders/ws/5n9mh6310y99my1xptmhkzzw0000gn/T/aven-orchestrator-proof-CuWhFE/`.
- The first launcher smoke rejected a partial `APPROVED` result because Antigravity's final envelope was `ERROR` (`stream interrupted`). It created no commit in that fixture. After bounded retry and effort controls were added, `npm run ai:auto -- --smoke --quota-ready` returned `SMOKE_PASSED` with both real CLIs. The smoke receipt is private and bound to the current runner digest.
- Earlier read-only provider preflight: exact Vercel project and Supabase project matched, GitHub public main was readable, but authenticated GitHub scope was unavailable and main was not protected. This proves read access only, not deployment or billing permissions.
- `npm run ai:auto` on the actual checkout previously stopped at the existing admin `BLOCKED` checkpoint without starting a task. This checkpoint, its Planning receipt, and dirty `BACKLOG.md`/`STATE.md` remain untouched.

## Review boundaries

Antigravity reviewed the exact setup diff and recorded an actual `APPROVED` decision in `REVIEW.md`. Commit `da9290b` contains the reviewed setup files and lifecycle artifacts; the blocked admin metadata was excluded. No push, backlog run, Production migration or deploy has occurred. The actual admin checkpoint still needs a separately reviewed recovery using the user's chosen existing statuses (`new`, `consulting`, `completed`, `cancelled`). M2–M8 release milestones remain pending; a successful launcher smoke does not imply the whole release system is complete.
