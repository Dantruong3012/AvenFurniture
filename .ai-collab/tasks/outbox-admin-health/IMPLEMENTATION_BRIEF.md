# Implementation brief: outbox-admin-health

Authorized admin sees aggregate outbox health without message body exposure or delivery mutation

## Authorized files

- app/admin/(protected)/page.tsx
- app/api/admin/outbox/health/route.ts
- components/admin/outbox-health-card.tsx
- lib/email/outbox.ts
- lib/types.ts
- tests/admin-outbox-health.test.mjs
- tests/email-outbox.test.mjs

## Requirements

# Task Plan: outbox-admin-health  ## Goal Description Enable authorized administrators to view aggregate email outbox health metrics (e.g. counts grouped by status: pending, sent, failed, dead-letter/exhausted) without exposing any email recipient addresses, subject lines, message bodies, or mutation/retry capabilities.  ## Acceptance Criteria - Authorized admin sees aggregate outbox health without message body exposure or delivery mutation. - Only aggregate health counts/statuses (e.g., total pending, sent, failed, dead-letter, retry backlog) are retrieved and displayed. - Message bodies, subjects, recipient emails, headers, and mutation/retry triggers are strictly omitted/disallowed. - Unauthorized access is blocked adhering to existing admin protection and role verification patterns. - Unit and integration tests verify metric calculation, sanitization/absence of sensitive payload fields, and authorized access control.  ## Proposed Changes  ### Backend / Repository Layer - `lib/email/outbox.ts`: Add `getOutboxHealthSummary()` function that queries the outbox table to aggregate message counts grouped by delivery status (`pending`, `processing`, `delivered`, `failed`), computing ba

## Acceptance criteria

Authorized admin sees aggregate outbox health without message body exposure or delivery mutation
