# Plan: outbox-operations

Status: APPROVED

### Acceptance Criteria
1. Expose outbox health inspection functions (e.g. counts/statuses of pending, processing, failed, sent messages, dead-letter items, or retry candidates) in `lib/email/outbox.ts`.
2. Support scoped retry execution on selected or failed outbox records through existing worker functions in `lib/email/outbox.ts` without introducing new external dependencies.
3. Ensure mock mailer or transport isolation is respected so tests execute deterministically without sending real email or requiring production credentials.
4. Add comprehensive unit tests in `tests/email-outbox.test.mjs` validating health metric reporting and scoped retry behaviors.

### Implementation Steps
1. **Outbox Health & Inspection API**:
   - Enhance `lib/email/outbox.ts` with helper functions to query outbox message states, failure counts, and health status summary.
   - Ensure all queries use existing Supabase client wrappers and enforce proper error handling.
2. **Scoped Retry Mechanism**:
   - In `lib/email/outbox.ts`, provide a function to selectively mark or trigger retries for specific message IDs or eligible failed messages.
   - Ensure concurrency safety and retry attempt increments align with existing retry thresholds.
3. **Mailer Verification & Test Isolation**:
   - Verify `lib/email/mailer.ts` respects test mode or mock transports so no live emails are dispatched during local and CI test execution.
4. **Automated Testing**:
   - Expand `tests/email-outbox.test.mjs` to test outbox health summary extraction, scoped retry transitions, failure handling, and verification that transport mocks intercept outgoing mail.

Owned paths: lib/email/outbox.ts, lib/email/mailer.ts, tests/email-outbox.test.mjs
