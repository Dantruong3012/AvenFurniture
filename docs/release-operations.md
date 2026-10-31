# Release operator runbook

Policy: [release-policy.md](release-policy.md). Current infrastructure findings: [readiness audit](production-readiness-2026-10-31.md). The local release tools are separate from the existing unattended `.ai-collab/orchestrator.mjs`; they do not weaken its agent receipts or activate its release configuration.

Current owner decision: Codex-only Solo release, main human approvals 0 (verified), six required CI checks preserved, and a release-specific backup waiver accepted including the enumerated Auth/MFA/session/staff/media/category/audit data (owner confirmed these can be recreated). Read [current migration preparation](production-migrations-waiver-preflight.md). Earlier independent-human/full-backup requirements below are superseded only to that extent; do not re-request the waiver. The exact owner-approved ten-migration packet was applied once and passed read-only postflight (15 versions); see the linked report/manifest. No merge or deploy is authorized. Existing CLI validators have not been changed to implement Solo and must not be claimed to pass it; no Orchestrator/tooling rewrite is part of this work.

## Prerequisites

Use Node 22.17.1 and `npm ci`. Operator scripts use Node's experimental type stripping; the runtime warnings are expected on this Node version. Set `GH_TOKEN` or `GITHUB_TOKEN` in a protected operator environment outside the checkout, never in arguments or chat. PR creation needs a credential with PR write permission; inspection needs repository/check/status/review/protection read access. Use a separately scoped Vercel read token for `VERCEL_TOKEN`. Project/team IDs come from the verified disabled/manual release config. Do not decrypt environment values or load Production application secrets into CI.

Before any remote write, confirm the command, repository, head/base SHA and permission scope. The release tool rejects an unexpected origin or enabled/automatic release config. Commands default to inspection; `--write` exists only for draft PR creation. There is no merge, deployment, promotion, rollback or database mutation command. Existing programmatic controlled-merge callers also need explicit Production impact approval plus signed authorization; no application or CI flow invokes that entry point.

## Local verification

```sh
npm run lint
npx next typegen
npm run typecheck
npm test
node --test .ai-collab/orchestrator*.test.mjs .ai-collab/autopilot.test.mjs
npm run test:e2e
npm run build
npm run check:release-security
npm audit --audit-level=high
```

Use fixture public variables in CI as configured in `.github/workflows/ci.yml`. The build validates the project's fixed public Supabase origin but does not prove runtime database access. Live tests that log in, submit inquiries, upload media or write shared state are prohibited without separate authorization. Do not activate the deferred email tasks.

## PR and CI

Push only after explicit push authorization. A dev push can create a Vercel Preview; a main push/merge can affect Production. Once the approved dev SHA is actually remote:

```sh
npm run release:pr -- --head FULL_DEV_SHA
# Explicit draft creation only after reviewing the title/body and credential:
npm run release:pr -- --head FULL_DEV_SHA --write --title 'Release AvenFurniture' --body-file /absolute/path/reviewed-pr-body.md
npm run release:status -- --pr PR_NUMBER --head FULL_DEV_SHA
```

The draft must be made ready by an operator after evidence is complete. The tool reconciles repository/head/base/SHA, refuses multiple PRs, and re-reads after an uncertain creation response instead of retrying POST. Edit an existing PR body through GitHub with reviewed evidence; the tool reuses the existing PR without overwriting its title/body.

On GitHub, configure the `main` protection rule before merge: six exact contexts `lint`, `typecheck`, `unit-pglite-integration`, `local-fixture-e2e`, `build`, `security`, bound to the GitHub Actions app; strict up-to-date checks; at least one independent human review; stale dismissal; admin enforcement; conversation resolution; no force push, deletion or bypass. Allow merge commits and disable auto-merge; linear-history-only protection conflicts with this policy. A ruleset-only configuration that the current classic-protection adapter cannot verify blocks preflight until support is reviewed; it never bypasses protection. The six job names stay stable on every change; no path filter silently omits them. Re-run failed jobs from GitHub after diagnosis and inspect the new attempt for the current revision.

## Exact-SHA merge approval

Under the owner-approved Solo exception, Codex technical verification and owner operational approval replace the former independent-human requirement without creating a GitHub review. Before merge approval, verify active Supabase status, exact migration history/prerequisites, accepted waiver scope and read-only Preview health; separately approve any needed Production environment change. Verify Vercel's Git auto-deployment behavior **before** approving a merge.

An owner-controlled signer may use the exported `signMergeAuthorization` helper with a random secret of at least 32 characters supplied out of band. Claims are `actor` (currently `Dantruong3012`), `repository`, `pullRequest`, full `headSha`, full `baseSha`, `baseBranch: main`, `issuedAt`, `expiresAt` (Unix seconds, at most 900 seconds apart), and `productionImpactApproved: true`. The owner signs only after explicitly approving that exact merge and its Production impact. Store the resulting token outside the checkout in a mode-600 file; do not print it. Set `AVEN_MERGE_AUTHORIZATION_SECRET` in the protected operator environment. No signing secret was provisioned in this work and Codex has not signed a real approval.

```sh
npm run release:merge-check -- --pr PR_NUMBER --head FULL_DEV_SHA --authorization-file /absolute/protected/path/merge-authorization.txt --evidence
```

This verifies the current PR, exact Actions contexts/provider, current protection, latest independent reviews, base ancestry, mergeability, clean local tree, authorization expiry and another PR read. It never merges. A new head/base SHA or expired authorization requires a new owner decision/signature. GitHub enforces final protected-branch checks when the owner separately chooses **Create a merge commit**. Record GitHub's `merge_commit_sha`; do not substitute the dev SHA. An interrupted merge performed elsewhere must be reconciled with GitHub before any retry. The check is a point-in-time observation, not a reservation of branch state.

## Deployment observation and rollback evidence

After an approved manual merge, observe the same PR/head:

```sh
npm run release:status -- --pr PR_NUMBER --head FULL_DEV_SHA --evidence
```

The tool reads the full merged SHA from GitHub, Vercel project/list/detail and Production alias, then checks `/`, `/products`, `/sitemap.xml` with GET only. An exact READY deployment without alias identity is `Deployment Pending`; a matching alias without fresh healthy checks is not `Deployed`. Unavailable evidence is `Unverified`. Observations do not promise every business flow works; authenticated/mutation flows and real images still need approved validation.

`--evidence` writes private immutable per-observation JSON, an append-only event index, and an atomic latest snapshot under `.ai-collab/.runtime/release-observations/pr-<number>-<headSha>/`, holding the shared lock. Save/backup the sanitized receipts and CI links under the owner's operational retention policy; local ignored files alone are not off-machine archival. No API response bodies, tokens or environment values are stored.

Before Production changes, save the current known-good deployment ID and full SHA in an operator-controlled JSON file: `{"deploymentId":"dpl_...","sha":"FULL_SHA"}`. If a separately approved rollback is performed through Vercel, use the same status command with `--known-good-file /absolute/path/known-good.json --evidence`. `Rolled Back` requires a previously recorded `Deployed` observation for this release, an alias now pointing exactly to the recorded known-good deployment/SHA, and passing current health. Unexpected alias changes are drift/pending, not proof of rollback. The tool never performs rollback or reverses migrations.
