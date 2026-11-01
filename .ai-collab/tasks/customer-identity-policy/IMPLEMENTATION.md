# Implementation: customer-identity-policy

Status: READY_FOR_REVIEW
Changed paths: supabase/migrations/20261017230000_customer_identity_policy.sql, lib/auth/customer-policy.ts, lib/types.ts, tests/customer-identity-policy.test.mjs, lib/inquiries/actions.ts, lib/repositories/supabaseInquiryRepository.ts, components/portal/customer-portal.tsx, app/portal/page.tsx, tests/storefront-inquiry.test.mjs, tests/database.test.mjs
Commit: feat(customer-identity-policy): implement approved task
Commit hash: 2ca46620f4a6ff78eb6e18b41afcd2c0b20496f6

Implemented customer identity and privacy policy for inquiries and wishlists. The portal now shows only inquiries explicitly linked to the signed-in user; public contact lookup has been removed.

Local RLS tests cover linked versus guest inquiries, session validity, owner conflicts, profiles, and wishlists. Lint passed with two existing coordinator-file warnings; TypeScript, all 206 tests, production build, and git diff --check passed. No migration was run against Production. No files were staged or committed. Guest inquiry linking requires a future trusted verification workflow.

## Independent checks

- npm run lint: PASS
- npm run typecheck: PASS
- npm test: PASS
- npm run build: PASS
