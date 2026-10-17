# Implementation brief: staff-role-status

Super admin updates role and active status with last admin and session safeguards

## Authorized files

- components/admin/team-management.tsx
- lib/auth/actions.ts
- lib/auth/admin.ts
- lib/auth/validation.ts
- supabase/migrations/20261017223000_staff_role_status_safeguards.sql
- tests/staff-auth-policy.test.mjs
- tests/database.test.mjs

## Requirements

Authorizing addition of tests/database.test.mjs to task staff-role-status owned paths. The file contains test suite assertions for database operations and session behavior which need to align with the new session revocation and staff role/status safeguards. This is a local test modification, well within approved acceptance criteria, and does not touch Production, secrets, billing, or deployment.

## Acceptance criteria

Super admin updates role and active status with last admin and session safeguards
