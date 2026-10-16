# Plan: email-outbox-dispatch

Status: APPROVED

# Implementation Plan: email-outbox-dispatch

## Goal Description
Implement an asynchronous email outbox worker with distributed locking, exponential backoff retry logic, and mock/staging mailer adapters for dispatching queued notification emails (e.g. inquiry confirmations, quote requests).

## Acceptance Criteria
1. **Outbox Worker & Locking**: Worker fetches pending outbox records, acquires a lease/lock (with heartbeat or expiration) to prevent concurrent worker execution and race conditions.
2. **Exponential Backoff Retry**: Failed deliveries increment retry count and schedule next attempt using exponential backoff with jitter and a max retry ceiling; records exceeding max attempts are marked failed.
3. **Mock & Staging Mailer**: Transport abstraction supporting mock mailer (in-memory/log for test and local dev) and staging mailer, preventing accidental production email dispatch during dev/staging runs.
4. **Integration & Test Coverage**: Unit and integration tests covering lock acquisition/release, successful dispatch, retry scheduling on error, dead-letter/terminal failure state, and mock transport verification.

## File Ownership & Scope
- `lib/email/outbox.ts`: Core outbox processor, worker loop, locking mechanism, and exponential retry scheduler.
- `lib/email/mailer.ts`: Mailer interface and transport implementations (mock, staging, console/log).
- `lib/email/types.ts`: Outbox record interfaces, mailer options, dispatch results, and lock status types.
- `tests/email-outbox.test.mjs`: Test suite verifying worker locking, retry backoff calculation, batch dispatch, and mock delivery.

## Verification Plan
- Run `node --test tests/email-outbox.test.mjs` to verify worker locking, retry transitions, and mock email dispatch.
- Run `npm run build` and `npm run lint` (or project check commands) to ensure type correctness and module resolution.

Owned paths: lib/email/mailer.ts, lib/email/outbox.ts, lib/email/types.ts, tests/email-outbox.test.mjs
