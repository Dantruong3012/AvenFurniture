# Plan: newsletter-subscribe

Status: APPROVED

# Task Plan: newsletter-subscribe

## Overview
Implement storefront newsletter subscription with client-side & server-side email validation, rate limiting, duplicate prevention, and opt-in audit recording.

## Acceptance Criteria
1. Storefront subscription UI: Accessible form integrated into `components/layout/footer.tsx` accepting valid email addresses with clear loading, success, and error states.
2. Email validation: Strict RFC-compliant/normalized email validation on both client and server before processing.
3. Duplicate prevention: Idempotent or graceful handling for already subscribed emails without leaking sensitive subscriber state or throwing unhandled errors.
4. Rate limiting: Abuse prevention (IP/window or token-based) to safeguard subscription endpoints against spam submissions.
5. Opt-in audit tracking: Record subscription audit metadata (source, timestamp, opt-in consent flag, IP/user-agent hash where applicable) consistent with `supabase/migrations/20261017180000_newsletter_data_policy.sql` and existing schema policies.
6. Test coverage: Comprehensive unit and integration tests covering valid subscription, duplicate subscription, invalid format, rate limiting, and policy compliance.

## Target Paths and Ownership
- `components/layout/footer.tsx`: Integrate newsletter subscription form with user feedback states.
- `lib/newsletter/actions.ts`: Server action for subscription processing, validation, rate check, and database interaction.
- `lib/newsletter/policy.ts`: Validation, rate limiting rules, and opt-in audit formatting.
- `lib/newsletter/types.ts`: TypeScript contracts for subscription payloads, responses, and audit records.
- `tests/newsletter-policy.test.mjs`: Test suite covering email format validation, rate limits, duplicate handling logic, and audit assertions.

Owned paths: components/layout/footer.tsx, lib/newsletter/actions.ts, lib/newsletter/policy.ts, lib/newsletter/types.ts, tests/newsletter-policy.test.mjs
