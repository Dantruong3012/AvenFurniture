# Implementation brief: staff-delete

Approved removal policy preserves inquiry and audit history

## Authorized files

- supabase/migrations/20261017233000_staff_deletion_policy.sql
- lib/auth/admin.ts
- lib/consultants/actions.ts
- components/admin/team-management.tsx
- components/admin/consultant-management.tsx
- tests/staff-auth-policy.test.mjs

## Requirements

# Plan: Staff Deletion Lifecycle (staff-delete)  ## Overview & Objective Implement safe staff deletion / offboarding lifecycle according to the approved acceptance criteria: "Approved removal policy preserves inquiry and audit history."  When a staff member or consultant is deleted/deactivated/removed: 1. Historical inquiry assignments, responses, and activity trails must not be cascade deleted or corrupted. 2. Inquiries assigned to or updated by deleted staff retain their historical references or transition to an unassigned/archived state without breaking database constraints. 3. Audit log records referencing the removed user/actor remain intact. 4. Active sessions / auth credentials for removed staff are invalidated. 5. The UI in Team Management and Consultant Management prevents destructive cascading and enforces soft deletion / deactivation / safe removal semantics.  ## Proposed Paths - `supabase/migrations/20261017233000_staff_deletion_policy.sql` (New migration implementing safe foreign key behavior, soft-delete / deactivated status, or set-null constraints on user references to protect audit/inquiry histories) - `lib/auth/admin.ts` (Implement/update staff removal server acti

## Acceptance criteria

Approved removal policy preserves inquiry and audit history
