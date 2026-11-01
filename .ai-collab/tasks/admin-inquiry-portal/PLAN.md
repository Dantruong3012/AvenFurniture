# Plan: admin-inquiry-portal

Status: APPROVED

# Implementation Plan: admin-inquiry-portal

## Goal
Implement a dedicated Admin Inquiry Portal allowing store administrators to inspect, filter, manage status, and record internal notes for customer contact inquiries and product quote requests, using the existing Supabase database schema and statuses.

## Architecture & Status Alignment
The database check constraint and existing TypeScript definitions require inquiries to use exactly these statuses:
- `new`
- `consulting`
- `completed`
- `cancelled`
Filter views support all non-deleted inquiries via `all`. Do not propose or introduce `in_progress`, `resolved`, or `archived`.

## Acceptance Criteria
1. Admin Inquiry Table:
   - Dedicated route at `app/admin/(protected)/inquiries/page.tsx` with admin session check.
   - Display columns for created date, reference number, customer name, contact details (phone, email), source badge (`cart`, `product`, `contact`, `manual`), status badge, and item count.
   - Search bar filtering by customer name, phone, or email.
   - Pagination support using repository parameters.
2. Status Filters:
   - Filter tabs: `All`, `New`, `Consulting`, `Completed`, `Cancelled`.
   - Selecting a status filters inquiries; `All` fetches all active records.
3. Detail Drawer:
   - Slide-over drawer presenting customer details, verbatim message, and referenced items table.
   - Status transition controls to move between `new`, `consulting`, `completed`, and `cancelled`.
4. Internal Staff Notes:
   - Internal notes timeline within the drawer.
   - Note creation input adhering to validation constraints and persisted via repository methods.
5. Shell Navigation:
   - Navigation link for Inquiries (`/admin/inquiries`) in `components/admin/catalog-shell.tsx` with active route state.

## Scope & File Ownership
Authorized paths for Codex:
- `app/admin/(protected)/inquiries/page.tsx`
- `components/admin/catalog-shell.tsx`
- `components/admin/inquiry-portal.tsx`
- `components/ui/icons.tsx`
- `lib/inquiries/actions.ts`
- `lib/repositories/supabaseInquiryRepository.ts`
- `lib/types.ts`
- `lib/validation/inquiry.ts`
- `tests/admin-inquiry.test.mjs`
- `tests/inquiry.test.mjs`

## Verification
- Unit and integration tests in `tests/admin-inquiry.test.mjs` and `tests/inquiry.test.mjs`.
- Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

Owned paths: app/admin/(protected)/inquiries/page.tsx, components/admin/catalog-shell.tsx, components/admin/inquiry-portal.tsx, components/ui/icons.tsx, lib/inquiries/actions.ts, lib/repositories/supabaseInquiryRepository.ts, lib/types.ts, lib/validation/inquiry.ts, tests/admin-inquiry.test.mjs, tests/inquiry.test.mjs
