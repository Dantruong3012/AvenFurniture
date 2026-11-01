# Implementation brief: email-change-events

Transactional event queueing for inquiry assignment and status updates with idempotency and mock delivery

## Authorized files

- lib/email/outbox.ts
- lib/email/types.ts
- lib/inquiries/actions.ts
- lib/repositories/supabaseInquiryRepository.ts
- lib/supabase/database.types.ts
- supabase/migrations/20261017163000_inquiry_change_events.sql
- tests/admin-inquiry.test.mjs
- tests/database.test.mjs
- tests/email-outbox.test.mjs
- tests/inquiry.test.mjs

## Requirements

# Plan: email-change-events  Status: READY  ### Objective Enable transactional email event queueing when inquiries are assigned or updated in status, ensuring idempotency and testable mock delivery without requiring external production actions or live email infrastructure.  ### Acceptance Criteria 1. **Transactional Queueing**: When an inquiry assignment or status change occurs in `lib/inquiries/actions.ts` / repository layer, outbox events corresponding to inquiry changes (`inquiry.assigned`, `inquiry.status_changed`) are queued reliably and committed atomically with the domain mutation. 2. **Idempotency**: Duplicate event triggers (e.g. re-emitting status update or assignment with the same idempotency key or event payload) do not produce duplicate outbox queue entries or duplicate deliveries. 3. **Mock Delivery**: Queue processing supports mock delivery and deferred delivery in test/local environments, verifying that queued inquiry change events can be processed and marked delivered without requiring live external email provider credentials. 4. **Additive Local Migration**: Authorize additive PostgreSQL migration (`supabase/migrations/20261017163000_inquiry_change_events.sql`) ad

## Acceptance criteria

Transactional event queueing for inquiry assignment and status updates with idempotency and mock delivery
