# Plan: storefront-customer-portal

Status: APPROVED

# Implementation Plan: Storefront Customer Portal

## Objective
Implement a customer order/inquiry lookup portal where customers can verify identity via phone number or email and view their inquiry/order history and status without full administrative account authentication.

## Acceptance Criteria
1. **Customer Order Inquiry Lookup**: Provide a customer-facing portal route (`app/portal/page.tsx` or `/orders`) accessible to public users.
2. **Verification by Phone or Email**: Users can look up inquiries/orders matching their email address or phone number, with verification/validation logic (e.g. rate-limited query or verification token/code check, matching inquiry contact info).
3. **Order/Inquiry History View**: Display matching order inquiry records, including status, items requested, submission date, and consultant/quote notes.
4. **Security & Privacy**: Ensure customers can only see inquiries matching their verified email/phone; protect against brute-force enumeration via inquiry repository queries and validation rules.

## Proposed Changes

### 1. Data Access & Inquiries Layer
- `lib/inquiries/actions.ts`: Add server action `lookupCustomerInquiries(identifier: { email?: string; phone?: string })` with rate-limiting and validation.
- `lib/repositories/supabaseInquiryRepository.ts`: Add inquiry retrieval by email or phone.
- `lib/validation/inquiry.ts`: Add Zod schema for portal inquiry lookup request (validating phone or email).

### 2. UI Components & Pages
- `app/portal/page.tsx`: New customer portal page with lookup form and inquiry history results.
- `components/portal/customer-portal.tsx`: Client component managing state, verification/input form, and inquiry card list.
- `components/layout/header.tsx`: (Optional navigation link to track orders/portal) or portal entry point.

### 3. Testing
- `tests/storefront-inquiry.test.mjs`: Unit/integration tests verifying customer inquiry lookup by email and phone, input validation, and result filtering.

## Verification
- Run `npm test` or `node --test tests/storefront-inquiry.test.mjs`.
- Run typecheck and linting: `npm run lint`, `npx tsc --noEmit`.

Owned paths: app/portal/page.tsx, components/portal/customer-portal.tsx, components/layout/header.tsx, lib/inquiries/actions.ts, lib/repositories/supabaseInquiryRepository.ts, lib/validation/inquiry.ts, tests/storefront-inquiry.test.mjs
