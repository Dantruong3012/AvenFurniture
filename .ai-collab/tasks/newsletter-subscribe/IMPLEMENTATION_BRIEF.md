# Implementation brief: newsletter-subscribe

Storefront newsletter subscription with email validation, rate limiting, duplicate prevention and opt-in audit

## Authorized files

- components/layout/footer.tsx
- lib/newsletter/actions.ts
- lib/newsletter/policy.ts
- lib/newsletter/types.ts
- tests/newsletter-policy.test.mjs

## Requirements

# Task Plan: newsletter-subscribe  ## Overview Implement storefront newsletter subscription with client-side & server-side email validation, rate limiting, duplicate prevention, and opt-in audit recording.  ## Acceptance Criteria 1. Storefront subscription UI: Accessible form integrated into `components/layout/footer.tsx` accepting valid email addresses with clear loading, success, and error states. 2. Email validation: Strict RFC-compliant/normalized email validation on both client and server before processing. 3. Duplicate prevention: Idempotent or graceful handling for already subscribed emails without leaking sensitive subscriber state or throwing unhandled errors. 4. Rate limiting: Abuse prevention (IP/window or token-based) to safeguard subscription endpoints against spam submissions. 5. Opt-in audit tracking: Record subscription audit metadata (source, timestamp, opt-in consent flag, IP/user-agent hash where applicable) consistent with `supabase/migrations/20261017180000_newsletter_data_policy.sql` and existing schema policies. 6. Test coverage: Comprehensive unit and integration tests covering valid subscription, duplicate subscription, invalid format, rate limiting, and po

## Acceptance criteria

Storefront newsletter subscription with email validation, rate limiting, duplicate prevention and opt-in audit
