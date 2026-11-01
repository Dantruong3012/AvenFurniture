# Implementation brief: newsletter-data-policy

Approve newsletter subscriber schema, opt-in consent, retention, tokenized unsubscribe, and RLS policy

## Authorized files

- supabase/migrations/20261017180000_newsletter_data_policy.sql
- lib/supabase/database.types.ts
- lib/newsletter/types.ts
- lib/newsletter/policy.ts
- lib/newsletter/actions.ts
- tests/newsletter-policy.test.mjs
- tests/database.test.mjs

## Requirements

# Task Plan: newsletter-data-policy  ## Objective Establish a privacy-compliant newsletter data policy and architecture for Aven, including subscriber schema, opt-in consent records (timestamp, source, IP/user-agent metadata hashing/redaction), automated retention rules, secure tokenized unsubscribe mechanics, and Supabase RLS policies ensuring public subscribers cannot read subscriber rosters while staff/admins retain authorized access.  ## Acceptance Criteria 1. **Subscriber Schema & Consent Record**: Define `newsletter_subscribers` table tracking `id`, `email`, `status` (`pending`, `active`, `unsubscribed`), `consent_timestamp`, `consent_source`, `consent_version`, `unsubscribe_token` (cryptographically random, indexed/unique), `created_at`, and `updated_at`. 2. **Tokenized Unsubscribe**: Implement token generation and secure verification for single-click / token-based unsubscribe without requiring authentication or exposing recipient emails. 3. **Data Retention Policy**: Define retention lifecycle rules for unsubscribed/inactive records (e.g., anonymization or purge eligibility after retention period) and helper/cleanup definitions. 4. **Row-Level Security (RLS)**: Enforce stri

## Acceptance criteria

Approve newsletter subscriber schema, opt-in consent, retention, tokenized unsubscribe, and RLS policy
