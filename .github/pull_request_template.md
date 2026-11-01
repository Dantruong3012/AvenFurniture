## Change and verification

Describe the behavior, task IDs, scope, risks and test evidence. Link local evidence and the six CI jobs for the current PR revision. State skipped/unavailable live coverage explicitly.

- [ ] Head is `dev/aven-autonomous-backlog`, base is `main`, repository and full head/base SHA verified.
- [ ] `lint`, `typecheck`, `unit-pglite-integration`, `local-fixture-e2e`, `build`, `security` passed on this revision.
- [ ] Independent human review and main branch protection are in force; no stale approval or bypass.
- [ ] No secrets, live database writes or deferred email activation in CI/tests.
- [ ] Pending Supabase migrations and their separate approval/backup plan are recorded.
- [ ] Production impact of merging main is understood; explicit approval for the exact SHA exists before merge.
- [ ] Known-good deployment/SHA and manual rollback plan recorded.

CI Passed does not mean Merge Approved, Merged or Deployed. Production deployment, migration, environment change and rollback approvals are separate. See [release policy](../docs/release-policy.md).
