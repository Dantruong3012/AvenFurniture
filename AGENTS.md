<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AvenFurniture multi-agent development

These repository rules apply to Google Antigravity and OpenAI Codex. Keep the Next.js-generated block above intact. Read `.ai-collab/README.md` for artifact formats and operating commands. User instructions take precedence. A roadmap approved by the user authorizes ordinary scoped code, tests, and local commits without separate approval for each step; Production actions still require explicit approval.

## Roles

- **Antigravity — Lead Architect / Planner / Reviewer:** Own the product backlog, priority, dependencies, architecture, task plans, and acceptance criteria. Review Codex's implementation and verification evidence, request specific fixes, mark a genuinely passing review `APPROVED`, and choose the next eligible task. In this role, do not edit application source or claim to have run Codex's checks.
- **Codex — Developer / QA:** Take eligible tasks from the approved backlog, read the task plan, implement code and meaningful unit/integration tests, run lint, TypeScript check, test suite, and production build, fix failures, write implementation evidence, address review feedback, and commit only after an actual Antigravity `APPROVED` review. Continue to the next eligible task within the approved roadmap without waiting for a new user prompt. Do not invent a review or change approved architecture silently.

## Task lifecycle and artifacts

Use `.ai-collab/BACKLOG.md` as the task queue and `.ai-collab/STATE.md` as the current pointer. Each task has a unique ID and real Markdown artifacts in `.ai-collab/tasks/<task-id>/`: `PLAN.md`, `IMPLEMENTATION.md`, and `REVIEW.md`, created when their stage begins. Do not create placeholder tasks.

The allowed lifecycle is `BACKLOG → PLANNING → READY → IN_PROGRESS → TESTING → READY_FOR_REVIEW → APPROVED → COMMITTED → DONE`. Review feedback follows `READY_FOR_REVIEW → CHANGES_REQUESTED → IN_PROGRESS`; an unrecoverable issue goes to `BLOCKED`. An Antigravity quota failure pauses the current phase as `PAUSED_QUOTA`; it does not count as an implementation/review failure. Resume after the reported reset time, or use `resume --quota-ready` earlier only after verifying the CLI works. No `DONE` without passing required checks, an Antigravity review artifact marked `APPROVED`, and a task commit. Never represent one agent's own output as the other agent's review.

Antigravity may mark a plan `APPROVED` only for work inside the user's approved roadmap. A material scope or architecture change is `REVISED` until the user approves the changed scope. Codex records blockers in `IMPLEMENTATION.md` for Antigravity to resolve. Limit implementation/review to three rounds per task; then mark `BLOCKED` and request a scope or architecture decision. A `BLOCKED` artifact overrides a stale `READY` backlog row and cannot be cleared automatically.

After `DONE`, select the highest-priority `READY` task whose dependencies are `DONE`. If none are ready, Antigravity can plan an approved `BACKLOG` task. Do not invent new features or pass blocked dependencies. When the approved backlog is exhausted, verify acceptance criteria, unresolved bugs, and the test suite, report completion, and stop.

## Commit and concurrency rules

After Antigravity approval, Codex confirms all required checks pass, inspects Git status and diff, scans intended staged blobs for secrets, stages only task-owned paths, and creates a conventional commit: `feat(scope): description`, `fix(scope): description`, `refactor(scope): description`, `test(scope): description`, or `docs(scope): description`. Record the hash in `IMPLEMENTATION.md` and `BACKLOG.md`, then mark `DONE`. A commit does not authorize push or deployment. Never use blind `git add .`, force-push, hard-reset, or overwrite unrelated work.

Use a task-specific branch or an explicit file-ownership list, plus `.ai-collab/.lock` for a single local coordinator. Two agents must not edit the same file concurrently. If unexpected changes, ownership conflicts, or Git conflicts appear, preserve all data and mark the task `BLOCKED`. Reviewer edits belong only in the task's `REVIEW.md` and planning/backlog artifacts; implementation edits belong to Codex.

For unattended execution, use `.ai-collab/orchestrator.mjs`. Antigravity returns structured plans/reviews from supplied task context; Codex edits only owned paths in `workspace-write` with unavailable approvals denied. The coordinator runs required checks independently, binds review to the tested files, and accepts a structured commit request from read-only Codex. Its fixed Git executor stages only task paths and verifies commit parent/tree. Never bypass permissions or treat an agent's PASS/APPROVED response alone as proof of execution. Preserve checkpoints on stop; `resume` cannot clear an architectural `BLOCKED`. The separate `recover-quota` command may reclassify only a legacy CLI-exit `BLOCKED` checkpoint when its saved log proves quota exhaustion; it never invokes an agent.

## Production safety

- Ordinary scoped code, refactors, tests, local builds, fixes, and Git commits may proceed automatically.
- Ask the user before a Production database migration, Production data deletion/change, sensitive Supabase Auth or RLS change, secret or Cloudinary credential change, Vercel environment change, or Production deploy.
- Never reset the Production database, commit secrets, create/import demo products in Production, or treat a successful review as deployment approval.
- If an agent cannot be invoked through a supported interface, leave a concrete file handoff and report the limitation. Do not claim autonomous two-agent operation until it has been exercised end to end.
