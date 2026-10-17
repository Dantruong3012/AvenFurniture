# Plan: outbox-admin-health

Status: APPROVED

# Task Plan: outbox-admin-health

## Goal Description
Enable authorized administrators to view aggregate email outbox health metrics (e.g. counts grouped by status: pending, sent, failed, dead-letter/exhausted) without exposing any email recipient addresses, subject lines, message bodies, or mutation/retry capabilities.

## Acceptance Criteria
- Authorized admin sees aggregate outbox health without message body exposure or delivery mutation.
- Only aggregate health counts/statuses (e.g., total pending, sent, failed, dead-letter, retry backlog) are retrieved and displayed.
- Message bodies, subjects, recipient emails, headers, and mutation/retry triggers are strictly omitted/disallowed.
- Unauthorized access is blocked adhering to existing admin protection and role verification patterns.
- Unit and integration tests verify metric calculation, sanitization/absence of sensitive payload fields, and authorized access control.

## Proposed Changes

### Backend / Repository Layer
- `lib/email/outbox.ts`: Add `getOutboxHealthSummary()` function that queries the outbox table to aggregate message counts grouped by delivery status (`pending`, `processing`, `delivered`, `failed`), computing backlog size, oldest pending item age, and failure rates without selecting or returning `payload`, `body`, `recipient`, `to`, `subject`, or other sensitive columns.
- `lib/types.ts`: Define `OutboxHealthSummary` type representing aggregate metrics only.

### Admin API / Route Layer (or Server Action)
- `app/api/admin/outbox/health/route.ts` (NEW) or server action in `lib/email/outbox.ts`: Expose a GET endpoint or admin server action requiring authenticated admin session via `lib/auth/admin.ts`. Return `OutboxHealthSummary` strictly. Ensure no mutation methods (POST, PUT, DELETE, PATCH) exist on this endpoint.

### Admin Dashboard / UI Presentation
- `app/admin/(protected)/page.tsx` or `components/admin/outbox-health-card.tsx` (NEW): Present the aggregate health summary (status badges, count breakdowns, delivery health indicator) within the protected admin area without any controls to mutate, resend, or inspect message contents.

### Automated Testing
- `tests/email-outbox.test.mjs`: Test `getOutboxHealthSummary()` to verify it returns accurate aggregate numbers, properly handles empty states, and never exposes payload/message body contents.
- `tests/admin-outbox-health.test.mjs` (NEW): Verify admin authentication enforcement, response schema validation (guaranteeing no message bodies or sensitive info), and rejection of mutation requests.

## Verification Plan
- Run `npm test` or `node tests/email-outbox.test.mjs` and `node tests/admin-outbox-health.test.mjs`.
- Run typecheck (`tsc --noEmit`) and linter.
- Build project (`npm run build`) to ensure zero route/page compilation issues.

Owned paths: app/admin/(protected)/page.tsx, app/api/admin/outbox/health/route.ts, components/admin/outbox-health-card.tsx, lib/email/outbox.ts, lib/types.ts, tests/admin-outbox-health.test.mjs, tests/email-outbox.test.mjs
