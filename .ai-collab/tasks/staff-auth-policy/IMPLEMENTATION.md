# Implementation: staff-auth-policy

Status: READY_FOR_REVIEW
Changed paths: supabase/migrations/20261017193000_staff_auth_policy.sql, lib/auth/admin.ts, lib/auth/actions.ts, lib/auth/session.ts, lib/auth/validation.ts, app/admin/(protected)/team/page.tsx, components/admin/team-management.tsx, tests/staff-auth-policy.test.mjs
Commit: feat(staff-auth-policy): implement approved task
Commit hash: 1044a672e851e0e548690098775182b8dfd83c40

Implemented staff invitations, role and account controls, live session checks, last-super-admin protection, and role-based RLS.

Verification passed: 202 tests, TypeScript check, production build, and git diff --check. Lint passed with two existing warnings in coordinator files. Deletion soft-deletes the Auth user and retains a disabled profile for audit history. No migration was applied, and nothing was staged or committed.

## Independent checks

- npm run lint: PASS
- npm run typecheck: PASS
- npm test: PASS
- npm run build: PASS
