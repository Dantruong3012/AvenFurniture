# Plan: inquiry-assignment

Status: APPROVED

# Task Plan: inquiry-assignment

## Goal
Enable administrative users to assign or unassign active staff members to customer inquiries in the admin inquiry portal, backed by server-side validation and audit logging.

## Acceptance Criteria
1. Staff assignment UI in `components/admin/inquiry-portal.tsx` allows assigning an active staff member or unassigning staff from an inquiry.
2. Server-side validation via `lib/validation/inquiry.ts` and `lib/inquiries/actions.ts` verifies that the target staff member exists and is active (or null when unassigning).
3. Repository mutation in `lib/repositories/supabaseInquiryRepository.ts` updates `assigned_to` and records an audit log entry for the assignment/unassignment event.
4. Unit and integration tests in `tests/admin-inquiry.test.mjs` verify assigning active staff, unassigning staff, rejecting inactive/invalid staff, and audit event creation.

## Proposed Changes
- `lib/validation/inquiry.ts`: Add schema/validation for inquiry assignment payload (`inquiryId`, `assignedTo` UUID or null).
- `lib/repositories/supabaseInquiryRepository.ts`: Add repository methods to update assignment and write audit trail records.
- `lib/inquiries/actions.ts`: Add server action `assignInquiryAction` with role/session checks, active staff validation, repository update, and revalidation.
- `components/admin/inquiry-portal.tsx`: Update inquiry list/detail components to include staff assignment selector dropdown and handle unassignment.
- `tests/admin-inquiry.test.mjs`: Add test coverage for successful assignment, unassignment, validation errors on inactive staff, and audit trail generation.

## Verification Plan
- Run `node tests/admin-inquiry.test.mjs` to ensure assignment, unassignment, validation, and audit behavior pass.
- Run lint and typecheck: `npm run lint` and `npm run typecheck`.

Owned paths: components/admin/inquiry-portal.tsx, lib/inquiries/actions.ts, lib/repositories/supabaseInquiryRepository.ts, lib/validation/inquiry.ts, tests/admin-inquiry.test.mjs
