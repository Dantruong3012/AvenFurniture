# Implementation brief: storefront-customer-portal

Customer order inquiry lookup portal, verification by phone or email and order history view

## Authorized files

- app/portal/page.tsx
- components/portal/customer-portal.tsx
- components/layout/header.tsx
- lib/inquiries/actions.ts
- lib/repositories/supabaseInquiryRepository.ts
- lib/validation/inquiry.ts
- tests/storefront-inquiry.test.mjs

## Requirements

# Implementation Plan: Storefront Customer Portal  ## Objective Implement a customer order/inquiry lookup portal where customers can verify identity via phone number or email and view their inquiry/order history and status without full administrative account authentication.  ## Acceptance Criteria 1. **Customer Order Inquiry Lookup**: Provide a customer-facing portal route (`app/portal/page.tsx` or `/orders`) accessible to public users. 2. **Verification by Phone or Email**: Users can look up inquiries/orders matching their email address or phone number, with verification/validation logic (e.g. rate-limited query or verification token/code check, matching inquiry contact info). 3. **Order/Inquiry History View**: Display matching order inquiry records, including status, items requested, submission date, and consultant/quote notes. 4. **Security & Privacy**: Ensure customers can only see inquiries matching their verified email/phone; protect against brute-force enumeration via inquiry repository queries and validation rules.  ## Proposed Changes  ### 1. Data Access & Inquiries Layer - `lib/inquiries/actions.ts`: Add server action `lookupCustomerInquiries(identifier: { email?: string;

## Acceptance criteria

Customer order inquiry lookup portal, verification by phone or email and order history view
