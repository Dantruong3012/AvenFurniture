# Release operations and configuration

Implementation stage: M1 only; release automation disabled.

## Read-only status

```sh
node .ai-collab/orchestrator.mjs doctor
node .ai-collab/orchestrator.mjs release-status
```

These commands report known evidence and credential availability, not authenticated permission or fabricated remote success. `deploy-status` will be added in M2 when it can report real Vercel observations.

The legacy `status`, `run`, `resume`, `stop`, quota recovery and replan commands retain their existing purpose. Do not run them to clear the current admin architecture blocker as part of release setup.

## M1 receipt and recovery

After a new development task completes its verified implementation and metadata commits, the coordinator archives `.runtime/completed/<sha>.json` even while release is disabled. It verifies Antigravity and Codex receipts, independent checks, approved Git tree, metadata-only changes, actual committed approval and a clean worktree. The archive is immutable. Existing Markdown approval is insufficient to reconstruct missing proof.

With release enabled in a reviewed configuration, the coordinator pushes the verified revision to the configured dev branch before continuing the backlog. Failure preserves development DONE and stops with a nonzero exit and separate release evidence. `release-push` retries only after revalidating all evidence and actual remote state. It cannot commit, merge, force push, deploy or migrate a database.

`.runtime/releases/<sha>.json` is the latest snapshot; `<sha>.events.jsonl` retains intents/results. A transport error after a successful remote update is reconciled via `ls-remote`, preventing a duplicate push. A divergent remote or unknown result is a failure, never a reason to reset, rebase or force.

Git operations have a configured timeout. A crashed external Git operation leaves a lock marker so ordinary resume cannot automatically remove a lock while an orphan process might still push. The operator must inspect remaining processes and exact remote SHA before approving lock recovery. No automatic stale-lock deletion for an unresolved external operation.

## Authentication and infrastructure setup

1. Keep `release.config.json` disabled/manual until M1 review and subsequent integration gates pass. M1 alone is not authorization to activate full CI/CD.
2. Configure supported GitHub CLI/API authentication outside chat. Use a scoped GitHub App or account credentials with the permissions listed in DESIGN.md; never copy Git credential-helper output into logs. Git push authentication and API authentication are separate.
3. Repository owner enables branch protection/rulesets on main with required CI/E2E checks and reviews, prohibits force pushes/deletion, and defines allowed merge strategy. M4 must inspect actual protections and fail closed if missing.
4. Restore Vercel access to the known team/project. Verify current Production Branch is main through settings/API, not historical deployment metadata. Use existing Git integration. Verify Preview build/runtime variable names without reading/decrypting or printing values; Local, Preview and Production intentionally share Supabase. Do not change their target. Do not copy Production secret keys into test fixtures.
5. Keep the existing shared Supabase project. No staging project creation is requested. Run only read-only live Preview checks and local mock/disposable tests for writes. Do not submit real inquiries, send emails, change products or use auth flows that persist shared state in automated tests. Record unavailable live write coverage explicitly; obtain scoped user approval before any shared-database mutation.
6. Approve/apply pending Production migrations separately, then refresh schema evidence. The inquiry RPC is currently missing. No merge until its verified prerequisites are satisfied.

## Safe activation sequence

- Resolve the unrelated admin task through Antigravity architecture review. Preserve its checkpoint and work. Activate from a clean dedicated checkout with reviewed runner code; never overwrite or silently adopt the blocked checkpoint.
- Complete and review M2–M8, including deterministic adapters and read-only Preview proof under the shared-database constraints. Validate GitHub protections and Vercel branch tracking live.
- Enable development push/Preview/PR automation only in a reviewed configuration. Keep `releaseMode: manual`; WAITING_RELEASE_APPROVAL must be observed before any merge.
- Auto mode is a later, explicit repository-owner decision and still requires a current authorization for the exact PR/SHA. This implementation task does not authorize it.
- On failed Production health, halt further releases, record incident and known-good deployment; prepare rollback for separate approval. Never reverse database migrations automatically.
