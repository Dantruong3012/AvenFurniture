# Release policy

Approved by the repository owner on 2026-10-31 in this session. The owner then delegated local decisions to Codex and explicitly stopped further Antigravity CLI use. This is a session exception to the Antigravity planning/review gate, not evidence of an independent review. The existing unattended orchestrator and its receipt validation remain unchanged. Email delivery/provider/scheduler/admin retry work is deferred.

## Pull request and CI

The release source is `Dantruong3012/AvenFurniture`, remote `origin`, head `dev/aven-autonomous-backlog`, base `main`. Verify the remote before creating or updating a PR. Reconcile by repository/head/base and exact head SHA; refuse duplicate PRs or a stale head. Do not push, open PRs, merge, or deploy merely because local tests pass.

GitHub Actions is the selected CI provider. All six contexts are required on the current PR revision: `lint`, `typecheck`, `unit-pglite-integration`, `local-fixture-e2e`, `build`, `security`. Tests include the real local SQL/RLS suite on disposable PGlite, the release/orchestrator suites, and Playwright fixtures on localhost. No live shared-database mutations, real credentials, email sending, or Production secrets belong in CI. PR workflows have read-only permissions, persist no checkout credential, and never use `pull_request_target` to execute PR code. Dependencies and actions are pinned; the lockfile is installed with `npm ci`. Security checks scan tracked content for credentials and reject high/critical dependency advisories; moderate findings remain visible for triage.

Every required job must actually complete successfully; pending, failed, cancelled, neutral, skipped, missing, or ambiguous checks block the release tool. Re-runs are explicit GitHub UI actions. A newer attempt supersedes an older attempt with the same check identity, and cannot borrow its success. Record head/base SHA, CI run/attempt, commands, exit results and evidence links. Retain CI evidence for 30 days; never upload `.env`, the build directory, or raw credential-bearing logs. CI success never authorizes merge.

## Review and merge

Enable a rule on `main` requiring the six contexts (bound to the GitHub Actions app), branches up to date, at least one independent human approval, dismissal of stale reviews, resolution of conversations, and no bypass (including admins), force push or deletion. Disable auto-merge. No independent human has been designated yet: this remains a live merge blocker. A bot or the PR author cannot satisfy human review. The local workflow exception does not waive GitHub review or branch protection.

Use a merge commit to retain the existing task commits and their ancestry. Do not rewrite, rebase or squash existing history as part of this release. Track PR head SHA separately from the resulting `merge_commit_sha`. A short-lived signed authorization binds repository, PR number, full head SHA, full base SHA, target branch, authorized actor and expiry. New head/base commits invalidate authorization. Before merging, re-read PR identity, current protection, exact checks and current independent approvals. Do not sign an authorization on behalf of the owner or store signing keys/tokens in Git, browser bundles, PR bodies or logs. A failed or uncertain merge response is reconciled with a GET before an operator decides whether to retry.

The operator tool performs merge preflight and observation only; actual merge is a separate explicit owner action through GitHub after all gates pass. The library's controlled merge entry point also requires explicit Production impact approval and a valid signed authorization. Nothing invokes it on CI success.

## Production and rollback

Vercel project `prj_PyRDr0N6RUnKTeKWaum17vWfkmkY`, team `team_TNVd8B1HyqiU94SchwMOUvBO`, is linked to `main` as Production Branch. It currently automatically assigns Production domains. Treat a merge/push to `main` as a possible Production deployment. **No merge until either the owner explicitly approves that exact merge and its Production impact, or a separately approved configuration change has demonstrably isolated deployment/promotion.** Do not silently change Vercel settings. Keep `.ai-collab/release.config.json` disabled/manual; no autonomous Production deployment is authorized.

Before a Production action present the exact candidate/head/base/merged SHA as applicable, affected project, pending migration list, risks, validation and known-good deployment. Obtain explicit approval for that action. Do not promote a Preview merely because it is READY: verify build environment, exact resulting merge SHA and prerequisites. Confirm the actual Production alias points to a READY/PROMOTED deployment for that full merged SHA, repository, branch and project; run read-only health checks. A matching READY deployment elsewhere is insufficient. Inaccessible APIs, unknown outcomes and unavailable health checks are reported as unverified.

Track `CI Passed`, `Merge Approved`, `Merged`, `Deployment Pending`, `Deployed`, `Deployment Failed`, and `Rolled Back` separately. `Deployed` requires exact alias identity and fresh successful health evidence. `Rolled Back` requires a previously verified deployment of this release plus a current alias pointing to the separately recorded known-good deployment; an arbitrary different alias is drift, not proof of rollback.

On failure halt release progress. Save sanitized deployment ID/URL/SHA and health evidence, prepare owner approval to promote the recorded known-good deployment, then verify its alias and health after the approved rollback. Never automatically reverse a database migration, change data, restore a paused project or alter Auth/RLS. Restoring Supabase, applying migrations and changing Production settings each need their own approval and recovery plan. Local, Preview and Production historically share Supabase; live testing is read-only. Do not create a staging project or enable deferred email work.

## Secrets and operational ownership

Use least-privilege GitHub credentials for PR/status inspection, and a separately scoped read-only Vercel token for observation. Provide them outside the checkout. Never print API response bodies on failure or arbitrary caught exception messages containing credentials. CI receives fixture public Supabase variables only. Production Supabase/Cloudinary keys remain server-side and are never copied to Preview/CI automatically. Confirm names, targets and presence without decrypting values. Credentials needed by operators are distinct from credentials needed by the application.

The owner controls GitHub protection, independent reviewer assignment, Production access, migration approval, and incident/rollback decisions. Application code that returns a friendly error is not monitoring: before Production approval establish the operational alert recipient and verify platform runtime error visibility. Local implementation, local tests, approval, remote CI, merge and deployment are distinct pieces of evidence.

References: [GitHub branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), [Vercel Git integration](https://vercel.com/docs/git), [Vercel manual promotion](https://vercel.com/docs/deployments/promoting-a-deployment).
