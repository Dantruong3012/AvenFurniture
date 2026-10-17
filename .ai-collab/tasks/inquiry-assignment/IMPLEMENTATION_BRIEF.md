# Implementation brief: inquiry-assignment

Assign or unassign active staff in inquiry UI with server validation and audit

## Authorized files

- components/admin/inquiry-portal.tsx
- lib/inquiries/actions.ts
- lib/repositories/supabaseInquiryRepository.ts
- lib/validation/inquiry.ts
- tests/admin-inquiry.test.mjs

## Requirements

# Task Plan: inquiry-assignment  ## Goal Enable administrative users to assign or unassign active staff members to customer inquiries in the admin inquiry portal, backed by server-side validation and audit logging.  ## Acceptance Criteria 1. Staff assignment UI in `components/admin/inquiry-portal.tsx` allows assigning an active staff member or unassigning staff from an inquiry. 2. Server-side validation via `lib/validation/inquiry.ts` and `lib/inquiries/actions.ts` verifies that the target staff member exists and is active (or null when unassigning). 3. Repository mutation in `lib/repositories/supabaseInquiryRepository.ts` updates `assigned_to` and records an audit log entry for the assignment/unassignment event. 4. Unit and integration tests in `tests/admin-inquiry.test.mjs` verify assigning active staff, unassigning staff, rejecting inactive/invalid staff, and audit event creation.  ## Proposed Changes - `lib/validation/inquiry.ts`: Add schema/validation for inquiry assignment payload (`inquiryId`, `assignedTo` UUID or null). - `lib/repositories/supabaseInquiryRepository.ts`: Add repository methods to update assignment and write audit trail records. - `lib/inquiries/actions.ts`:

## Acceptance criteria

Assign or unassign active staff in inquiry UI with server validation and audit
