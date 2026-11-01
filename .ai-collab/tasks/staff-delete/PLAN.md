# Plan: staff-delete

Status: APPROVED

# Plan: Staff Deletion Lifecycle (staff-delete)

## Overview & Objective
Implement safe staff deletion / offboarding lifecycle according to the approved acceptance criteria:
"Approved removal policy preserves inquiry and audit history."

When a staff member or consultant is deleted/deactivated/removed:
1. Historical inquiry assignments, responses, and activity trails must not be cascade deleted or corrupted.
2. Inquiries assigned to or updated by deleted staff retain their historical references or transition to an unassigned/archived state without breaking database constraints.
3. Audit log records referencing the removed user/actor remain intact.
4. Active sessions / auth credentials for removed staff are invalidated.
5. The UI in Team Management and Consultant Management prevents destructive cascading and enforces soft deletion / deactivation / safe removal semantics.

## Proposed Paths
- `supabase/migrations/20261017233000_staff_deletion_policy.sql` (New migration implementing safe foreign key behavior, soft-delete / deactivated status, or set-null constraints on user references to protect audit/inquiry histories)
- `lib/auth/admin.ts` (Implement/update staff removal server actions with safeguards preserving inquiry & audit logs)
- `lib/consultants/actions.ts` (Ensure consultant deletion handles associated user/inquiry relationships safely)
- `components/admin/team-management.tsx` (Add/update staff removal dialog & actions honoring retention policy)
- `components/admin/consultant-management.tsx` (Update consultant removal UI and warning states)
- `tests/staff-auth-policy.test.mjs` (Add test coverage validating preservation of audit and inquiry histories upon staff removal)

## Acceptance Criteria
1. Deleting or removing a staff account does not delete, purge, or corrupt existing inquiries or inquiry events associated with that staff account.
2. Audit records and security log entries associated with the removed staff member remain fully queryable and intact.
3. Last remaining super admin cannot be removed.
4. Removed staff member cannot authenticate or perform administrative actions.
5. Unit and policy tests pass verifying foreign key constraints and removal handlers.

Owned paths: supabase/migrations/20261017233000_staff_deletion_policy.sql, lib/auth/admin.ts, lib/consultants/actions.ts, components/admin/team-management.tsx, components/admin/consultant-management.tsx, tests/staff-auth-policy.test.mjs
