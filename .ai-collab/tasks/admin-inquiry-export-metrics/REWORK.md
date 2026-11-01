# Rework: admin-inquiry-export-metrics

Round: 2

## Root cause

Root Cause: The inquiry page attempts to invoke `getAdminInquiryMetrics` imported from `supabaseInquiryRepository`, but `getAdminInquiryMetrics` is not exported as a function from that module, resulting in `(0 , supabaseInquiryRepository_1.getAdminInquiryMetrics) is not a function`.  Smallest Correction: 1. Export the missing `getAdminInquiryMetrics` function in `supabaseInquiryRepository` with the expected return signature for inquiry metrics. 2. Re-run `npm test` to verify subtest 17 and all test suites pass.

## Required correction

Root Cause: The inquiry page attempts to invoke `getAdminInquiryMetrics` imported from `supabaseInquiryRepository`, but `getAdminInquiryMetrics` is not exported as a function from that module, resulting in `(0 , supabaseInquiryRepository_1.getAdminInquiryMetrics) is not a function`.  Smallest Correction: 1. Export the missing `getAdminInquiryMetrics` function in `supabaseInquiryRepository` with the expected return signature for inquiry metrics. 2. Re-run `npm test` to verify subtest 17 and all test suites pass.

## Files

- app/admin/(protected)/inquiries/page.tsx
- app/api/admin/inquiries/export/route.ts
- components/admin/inquiry-portal.tsx
- lib/inquiries/actions.ts
- lib/repositories/supabaseInquiryRepository.ts
- tests/admin-inquiry.test.mjs
