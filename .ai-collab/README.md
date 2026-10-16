# AvenFurniture multi-agent workflow

`AGENTS.md` is the shared policy. Antigravity owns planning/review; Codex owns implementation/tests and requests local commits after approval. The Node coordinator calls the real CLI processes sequentially. No IDE-to-IDE messaging, extra npm dependency, Production deployment, or database migration is part of this runner.

## Run, monitor, stop, resume

Run from a **clean dedicated checkout** containing the approved roadmap and task artifacts. Existing uncommitted work is refused and preserved; do not reset or automatically stash another agent's work. Existing `BLOCKED` artifacts take precedence over a stale `READY` queue row. The current inquiry transaction blocker requires a planner/user decision.

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

`orchestrator.config.json` selects the CLI command arrays, timeout (default ten minutes per invocation/check), maximum three implementation/review rounds, and required checks. CLI authentication must already work. Codex uses `workspace-write` for implementation and `read-only` for the commit request, with `approval_policy=never` so unavailable privileges are denied. Antigravity uses plan mode, sandbox, supplied source/diff context and structured JSON without shell tools. If it needs more context or permission, the task becomes `BLOCKED`. No permission-skipping flags or global permission settings are added.

## Queue and artifacts

`BACKLOG.md` is a seven-column Markdown table: Task ID, Priority (`P0`–`P3`), Dependencies (comma-separated IDs or `-`), Owner, Status, Acceptance criteria, Commit hash. It must have `Roadmap approval: APPROVED`. IDs are unique lowercase letters/digits/hyphens. Use simple single-line table cells without embedded pipes. Only add tasks from the approved roadmap.

Each real task has `.ai-collab/tasks/<task-id>/PLAN.md`, `IMPLEMENTATION.md`, and `REVIEW.md`. The coordinator writes these from actual agent results, retaining private JSON execution receipts. `PLAN.md` has `Status: APPROVED` only after a successful Antigravity planning invocation; it lists exact file ownership. `IMPLEMENTATION.md` records actual check results and the implementation commit hash. `REVIEW.md` contains Antigravity's decision and invocation number. Codex must not invent approval.

The lifecycle is `BACKLOG → PLANNING → READY → IN_PROGRESS → TESTING → READY_FOR_REVIEW → APPROVED → COMMITTED → DONE`; feedback goes through `CHANGES_REQUESTED → IN_PROGRESS`. The runner chooses the highest-priority eligible `READY` task, then an eligible `BACKLOG` task for planning. All dependencies must be `DONE`. It never clears `BLOCKED`, and it stops when there is no eligible work. `NO_ELIGIBLE_TASK` can mean unresolved blockers, not that the whole roadmap is complete.

`STATE.md` is the human-readable pointer. `.runtime/checkpoint.json` stores restart information; `.runtime/events.jsonl` stores handoff events. Raw agent/check logs and receipts are private local files ignored by Git. Do not commit these logs, which may contain tool output or repository context. The `.lock` directory prevents concurrent coordinators; agents and humans must also respect file ownership.

## Verification and commits

The coordinator validates CLI exit status, JSON envelopes/schema fields, actual changed files, independent check exit codes, and Git state. It detects unowned edits, source changes after tests/review, modified npm check scripts, unexpected staging or commits, and failed/denied CLI runs. Reviews receive the actual plan, diff, current owned files and check evidence. A review context above the bounded input limit is blocked and needs task splitting.

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
