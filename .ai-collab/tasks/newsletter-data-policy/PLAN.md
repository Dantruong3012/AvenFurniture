# Plan: newsletter-data-policy

Status: APPROVED

# Task Plan: newsletter-data-policy

## Objective
Establish a privacy-compliant newsletter data policy and architecture for Aven, including subscriber schema, opt-in consent records (timestamp, source, IP/user-agent metadata hashing/redaction), automated retention rules, secure tokenized unsubscribe mechanics, and Supabase RLS policies ensuring public subscribers cannot read subscriber rosters while staff/admins retain authorized access.

## Acceptance Criteria
1. **Subscriber Schema & Consent Record**: Define `newsletter_subscribers` table tracking `id`, `email`, `status` (`pending`, `active`, `unsubscribed`), `consent_timestamp`, `consent_source`, `consent_version`, `unsubscribe_token` (cryptographically random, indexed/unique), `created_at`, and `updated_at`.
2. **Tokenized Unsubscribe**: Implement token generation and secure verification for single-click / token-based unsubscribe without requiring authentication or exposing recipient emails.
3. **Data Retention Policy**: Define retention lifecycle rules for unsubscribed/inactive records (e.g., anonymization or purge eligibility after retention period) and helper/cleanup definitions.
4. **Row-Level Security (RLS)**: Enforce strict RLS policies on `newsletter_subscribers` where anonymous/authenticated storefront clients can only insert subscription intents or update status via valid unsubscribe token, while full table read/export is restricted to authorized admin roles.
5. **TypeScript Definitions & Policy Helpers**: Export typed contracts in `lib/newsletter/types.ts`, verification and token policy logic in `lib/newsletter/policy.ts`, and server actions / handlers in `lib/newsletter/actions.ts`.
6. **Automated Verification**: Provide comprehensive unit and integration tests in `tests/newsletter-policy.test.mjs` and update PostgreSQL schema suite in `tests/database.test.mjs` verifying schema migration expectations, token validation, opt-in state transitions, RLS table counts, and policy access rules.

## Proposed Changes
- `supabase/migrations/20261017180000_newsletter_data_policy.sql`: Migration creating `newsletter_subscribers` table, constraints, indices on `email` and `unsubscribe_token`, RLS enablement, and role policies.
- `lib/supabase/database.types.ts`: Update Database types to include the `newsletter_subscribers` table and column definitions.
- `lib/newsletter/types.ts`: Type definitions for subscriber status, consent payload, and unsubscribe verification.
- `lib/newsletter/policy.ts`: Token generation, validation logic, and data retention / anonymization utilities.
- `lib/newsletter/actions.ts`: Safe server-side handlers for subscription opt-in and tokenized unsubscribe.
- `tests/newsletter-policy.test.mjs`: Test suite covering consent capture, token generation, unsubscribe lifecycle, and RLS policy rules.
- `tests/database.test.mjs`: Update database isolation test suite for 13 public tables and assert anonymous rejection on `newsletter_subscribers`.

## Verification Plan
- Run `node --test tests/newsletter-policy.test.mjs` to verify token mechanics, status transitions, and schema invariants.
- Run `node --test tests/database.test.mjs` to verify 13 public tables with RLS and private table access boundaries.
- Run `npm run typecheck` (or `tsc --noEmit`) to verify typed contract adherence.
- Verify no production changes, external secrets, or deployment actions are triggered.

Owned paths: supabase/migrations/20261017180000_newsletter_data_policy.sql, lib/supabase/database.types.ts, lib/newsletter/types.ts, lib/newsletter/policy.ts, lib/newsletter/actions.ts, tests/newsletter-policy.test.mjs, tests/database.test.mjs
