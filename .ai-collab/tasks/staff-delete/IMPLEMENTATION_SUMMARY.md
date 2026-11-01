# Implementation summary: staff-delete

## Changed files

- supabase/migrations/20261017233000_staff_deletion_policy.sql
- lib/auth/admin.ts
- components/admin/team-management.tsx
- components/admin/consultant-management.tsx
- tests/staff-auth-policy.test.mjs

## Behavior and evidence

Implemented staff offboarding safeguards that preserve inquiry and audit history.

The local migration blocks hard deletion of staff profiles and audits consultant profile removal. Team Management identifies removed Auth accounts and prevents further access changes; the consultant UI explains what history is retained. PGlite tests verify preserved assignments, notes, audit actors, and session revocation. Lint, typecheck, all 207 tests, and production build passed. No migration was run against Production; Git HEAD and index were untouched.

## Limitations / review questions

None reported
