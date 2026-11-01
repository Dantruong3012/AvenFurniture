# Plan: email-change-events

Status: APPROVED

# Plan: email-change-events

Status: READY

### Objective
Enable transactional email event queueing when inquiries are assigned or updated in status, ensuring idempotency and testable mock delivery without requiring external production actions or live email infrastructure.

### Acceptance Criteria
1. **Transactional Queueing**: When an inquiry assignment or status change occurs in `lib/inquiries/actions.ts` / repository layer, outbox events corresponding to inquiry changes (`inquiry.assigned`, `inquiry.status_changed`) are queued reliably and committed atomically with the domain mutation.
2. **Idempotency**: Duplicate event triggers (e.g. re-emitting status update or assignment with the same idempotency key or event payload) do not produce duplicate outbox queue entries or duplicate deliveries.
3. **Mock Delivery**: Queue processing supports mock delivery and deferred delivery in test/local environments, verifying that queued inquiry change events can be processed and marked delivered without requiring live external email provider credentials.
4. **Additive Local Migration**: Authorize additive PostgreSQL migration (`supabase/migrations/20261017163000_inquiry_change_events.sql`) adding `event_type`, `payload`, `idempotency_key`, and `schema_version` to `email_outbox`, along with atomic RPCs for assignment and status transitions. Tested on isolated in-memory PostgreSQL without touching production Supabase.
5. **Type Safety & Repository Integration**: Update `lib/supabase/database.types.ts`, `lib/email/types.ts`, `lib/email/outbox.ts`, `lib/repositories/supabaseInquiryRepository.ts`, and `lib/inquiries/actions.ts` to seamlessly use the transactional outbox.

### Technical Plan
- **Database Migration (`supabase/migrations/20261017163000_inquiry_change_events.sql`)**:
  - Add additive columns to `email_outbox`: `event_type`, `payload`, `idempotency_key`, `schema_version`.
  - Add unique index on `email_outbox(idempotency_key)` where `idempotency_key is not null`.
  - Define atomic RPC functions for inquiry assignment and status updates with definer security and empty search paths.
- **Types & Outbox (`lib/email/types.ts`, `lib/email/outbox.ts`, `lib/supabase/database.types.ts`)**:
  - Connect `EmailEventTransaction` / `enqueueEmailEvent` to the transactional persistence store.
  - Implement idempotency key generation and conflict deduplication for inquiry events.
- **Repository & Actions (`lib/repositories/supabaseInquiryRepository.ts`, `lib/inquiries/actions.ts`)**:
  - Call the transactional persistence helper/RPC during assignment and status changes.
  - Ensure actions handle outbox events safely alongside domain state changes.
- **Tests**:
  - `tests/database.test.mjs`: Test additive migration execution and transactional RPC semantics on isolated PostgreSQL.
  - `tests/email-outbox.test.mjs`: Test transactional event insertion, idempotency, duplicate prevention, and mock delivery.
  - `tests/inquiry.test.mjs` & `tests/admin-inquiry.test.mjs`: Verify status change and staff assignment enqueue the expected events.

Owned paths: lib/email/outbox.ts, lib/email/types.ts, lib/inquiries/actions.ts, lib/repositories/supabaseInquiryRepository.ts, lib/supabase/database.types.ts, supabase/migrations/20261017163000_inquiry_change_events.sql, tests/admin-inquiry.test.mjs, tests/database.test.mjs, tests/email-outbox.test.mjs, tests/inquiry.test.mjs
