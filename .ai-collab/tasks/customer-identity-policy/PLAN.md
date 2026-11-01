# Plan: customer-identity-policy

Status: APPROVED

The requested paths are directly related to resolving the customer identity policy and privacy model for inquiries/portal, updating the public inquiry repository and actions to not expose customer inquiry details insecurely, and updating existing tests (database table count expectation and storefront inquiry test) to align with the new customer identity schema and RLS policies. No production actions, billing changes, or deployment changes are involved. All paths are within the approved acceptance criteria scope.

Owned paths: supabase/migrations/20261017230000_customer_identity_policy.sql, lib/auth/customer-policy.ts, lib/types.ts, tests/customer-identity-policy.test.mjs, lib/inquiries/actions.ts, lib/repositories/supabaseInquiryRepository.ts, components/portal/customer-portal.tsx, app/portal/page.tsx, tests/storefront-inquiry.test.mjs, tests/database.test.mjs
