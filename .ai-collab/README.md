# AvenFurniture multi-agent workflow

`AGENTS.md` is the shared policy. Antigravity owns planning/review; Codex owns implementation/tests and requests local commits after approval. The Node coordinator calls the real CLI processes sequentially. No IDE-to-IDE messaging, extra npm dependency, Production deployment, or database migration is part of this runner.

## Run, monitor, stop, resume

Run from a **clean dedicated checkout** containing the approved roadmap and task artifacts. Existing uncommitted work is refused and preserved; do not reset or automatically stash another agent's work. Existing `BLOCKED` artifacts take precedence over a stale `READY` queue row.

```sh
node .ai-collab/workflow.mjs doctor
node .ai-collab/orchestrator.mjs run
```

In another terminal:

```sh
node .ai-collab/orchestrator.mjs status
tail -f .ai-collab/.runtime/events.jsonl
node .ai-collab/orchestrator.mjs stop
node .ai-collab/orchestrator.mjs resume
```

`stop` creates a stop request checked while the child runs; the coordinator terminates its process group and saves a `STOPPED` checkpoint. Ctrl-C/SIGTERM use the same path. `resume` recovers that task, validates files and Git state, and does not duplicate an already verified commit. It refuses `BLOCKED`; diagnose and preserve the recorded work before an explicit planner/operator decision. A stale lock is recovered only through `resume` after its parent and child are both dead. Do not delete a live lock.

Planning `paths` is the strict source-file allowlist for Codex (application code, tests, and local migration files). The coordinator writes `PLAN.md`, `IMPLEMENTATION.md`, and `REVIEW.md` through its lifecycle methods; these files never belong in `paths`, even if an older plan lists them under Codex ownership. `.ai-collab/` remains forbidden by path validation.

For the specific `Unsafe plan path: .ai-collab/tasks/<task>/IMPLEMENTATION.md` Planning failure, first obtain an Antigravity `APPROVED` review of the runner fix and commit only the reviewed runner files and review artifact. Then use `node .ai-collab/orchestrator.mjs recover-plan-path`. This command does not invoke either agent. It verifies the matching saved successful Planning receipt, exact offending artifact, approved reviewed runner commit, unchanged application source, unstaged index, and only the task's uncommitted metadata. It archives the generated BLOCKED artifact in private `.runtime/`, restores the earlier implementation artifact, retains the original plan and receipt, and moves the checkpoint to `READY`. Inspect `status` and then use `resume` to continue the same task. It refuses any other unsafe path, altered artifact, unreviewed commit, or unrelated changes; a failed preflight leaves the checkpoint unchanged. Do not edit the checkpoint or delete its receipt manually.

For a Codex `BLOCKED` checkpoint caused by an incomplete exact file allowlist, Antigravity must first revise the same task's `PLAN.md` with `Status: APPROVED` and an explicit `Owned paths:` list. After Antigravity reviews the replan runner fix and its `APPROVED` review is committed with only reviewed runner files, use `node .ai-collab/orchestrator.mjs replan`. The command checks the original Planning receipt, matching blocker, revised plan, Git ancestry, committed review, clean index, source baseline, and task metadata. It archives the exact blocked implementation artifact and stores the prior error, paths, round, and Planning receipt in checkpoint history. It changes the task to `PLANNING` without calling an agent. Then inspect `status` and use `resume`; Antigravity Planning runs again using the actual tracked `app/`, `components/`, `lib/`, and `tests/` path index plus bounded excerpts of files cited by the plan. Its returned source paths must match the approved revised `Owned paths` exactly. A failed preflight does not modify the checkpoint or source. Leave the task's dirty `BACKLOG.md`, `STATE.md`, `PLAN.md`, and `IMPLEMENTATION.md` out of the runner-upgrade commit. Do not run `replan` until the runner review and commit are complete.

If Antigravity reports `RESOURCE_EXHAUSTED`/individual quota exhaustion, the coordinator records `PAUSED_QUOTA` at the same phase with the reset time and stops. It makes no automatic retry. `status` shows the reset time. After that time, `resume` retries only the paused task and then stops; use a later `run` to process more backlog. An operator who has verified the CLI works can use `resume --quota-ready` before the recorded reset time. If Antigravity gives no reset time, that flag is required. The flag does not change the saved reset time or bypass Git checks; another 429 pauses the same task again. Tests/review/commit are still required before `DONE`.

For an older checkpoint mistakenly marked `BLOCKED` by a generic CLI exit, run `node .ai-collab/orchestrator.mjs recover-quota`. This command inspects the saved failed Antigravity log without calling a CLI; it requires proof of quota exhaustion and a matching checkpoint. It changes the local checkpoint/backlog/state to `PAUSED_QUOTA` and restores only the old generic error artifact from Git, keeping a copy and the original log in ignored `.runtime/`. It does not alter a review artifact or clear an architectural blocker. An updated runner committed while a quota checkpoint was paused can be adopted at `resume` only if the intervening commits touch the enumerated runner files, include a committed `orchestrator-quota-recovery/REVIEW.md` marked `APPROVED` by Antigravity, and no task source changed. Commit only the reviewed runner files and its review/implementation artifacts. Leave the paused task's `BACKLOG.md` and `STATE.md` changes uncommitted: including either in the runner upgrade commit is rejected. Uncommitted application changes are rejected too. A failed preflight leaves the checkpoint unchanged.

`orchestrator.config.json` selects the CLI command arrays, timeout (default ten minutes per invocation/check), maximum three implementation/review rounds, and required checks. CLI authentication must already work. Codex uses `workspace-write` for implementation and `read-only` for the commit request, with `approval_policy=never` so unavailable privileges are denied. Antigravity uses plan mode, sandbox, supplied source/diff context and structured JSON without shell tools. If it needs more context or permission, the task becomes `BLOCKED`. No permission-skipping flags or global permission settings are added.

## Queue and artifacts

`BACKLOG.md` is a seven-column Markdown table: Task ID, Priority (`P0`–`P3`), Dependencies (comma-separated IDs or `-`), Owner, Status, Acceptance criteria, Commit hash. It must have `Roadmap approval: APPROVED`. IDs are unique lowercase letters/digits/hyphens. Use simple single-line table cells without embedded pipes. Only add tasks from the approved roadmap.

Each real task has `.ai-collab/tasks/<task-id>/PLAN.md`, `IMPLEMENTATION.md`, and `REVIEW.md`. The coordinator writes these from actual agent results, retaining private JSON execution receipts. `PLAN.md` has `Status: APPROVED` only after a successful Antigravity planning invocation; it lists exact file ownership. `IMPLEMENTATION.md` records actual check results and the implementation commit hash. `REVIEW.md` contains Antigravity's decision and invocation number. Codex must not invent approval.

The lifecycle is `BACKLOG → PLANNING → READY → IN_PROGRESS → TESTING → READY_FOR_REVIEW → APPROVED → COMMITTED → DONE`; feedback goes through `CHANGES_REQUESTED → IN_PROGRESS`. The runner chooses the highest-priority eligible `READY` task, then an eligible `BACKLOG` task for planning. All dependencies must be `DONE`. It never clears `BLOCKED`, and it stops when there is no eligible work. `NO_ELIGIBLE_TASK` can mean unresolved blockers, not that the whole roadmap is complete.

`STATE.md` is the human-readable pointer. `.runtime/checkpoint.json` stores restart information; `.runtime/events.jsonl` stores handoff events. Raw agent/check logs and receipts are private local files ignored by Git. Do not commit these logs, which may contain tool output or repository context. The `.lock` directory prevents concurrent coordinators; agents and humans must also respect file ownership.

## Verification and commits

The coordinator validates CLI exit status, JSON envelopes/schema fields, actual changed files, independent check exit codes, and Git state. It detects unowned edits, source changes after tests/review, modified npm check scripts, unexpected staging or commits, and failed/denied CLI runs. Planning receives the task criteria, existing plan, an exact tracked application/test path index, and bounded excerpts of relevant existing files, without a repository-wide source dump. Review receives the plan, implementation evidence, diff for task-owned tracked files, and full content only for task-owned new files. A review context above the bounded input limit is blocked and needs task splitting.

Codex's final read-only invocation returns a structured `COMMIT_REQUESTED` object bound to the approved parent, tree and message. The coordinator's narrow Git executor performs that exact local commit and verifies the resulting parent/tree and clean worktree. This is deliberate: the model never receives elevated arbitrary shell permission to commit. A second metadata commit records the first hash in the Markdown artifacts; a commit cannot contain its own hash. No automatic push occurs. The next eligible task starts immediately.

`workflow.mjs next` retains queue inspection. `workflow.mjs complete <id>` now resumes a matching approved coordinator checkpoint; a manually written APPROVED file alone cannot trigger automatic commit. This prevents the legacy helper from bypassing real CLI receipts/checks.

## Proving the runner

```sh
node --test .ai-collab/orchestrator*.test.mjs
node .ai-collab/dry-run.mjs
```

The dry-run creates a fresh temporary Git repository, copies only the orchestration tools, and calls both real CLIs. Its harmless task creates one proof JSON file, passes independent fixture checks, receives a real Antigravity review, and produces real local task/metadata commits. It copies no application source or credentials, verifies the original repository is unchanged, and prints the proof repository and commit hashes. Those fixture checks prove orchestration; they do not replace application lint/typecheck/tests/build for product tasks.

The deterministic tests cover dependencies, retry exhaustion, false commit requests, source changes after approval, unowned review edits, stop/resume, locks and timeouts. They use fake processes only for failure injection; readiness additionally requires the real-CLI dry-run.

This is cooperative local automation, not an OS-level protection against arbitrary tools outside the coordinator. Configure CLI/MCP access conservatively, retain the sandbox defaults, and treat Production approvals as separate. The runner never runs migrations or deployments itself.

## Release upgrade (M1, pending review)

See [audit](release/AUDIT.md), [milestone design](release/DESIGN.md), and [operations](release/OPERATIONS.md). Release automation defaults to disabled/manual. `doctor` and `release-status` report current local evidence; `release-push` requires enabled reviewed configuration and immutable completed-task evidence. M2–M8 are planned separately. Local, Preview and Production share Supabase; live testing must remain read-only without separate approval. Do not change the blocked admin task checkpoint to activate this upgrade.
