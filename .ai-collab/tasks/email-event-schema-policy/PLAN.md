# Plan: email-event-schema-policy

Status: APPROVED

### Task: email-event-schema-policy

#### Goal & Acceptance Criteria
Approve durable event schema, payload model, mock/deferred provider contract, and idempotency rules for email events, ensuring offline/local verification without any Production database or third-party service actions.

#### Existing Context & Integration Points
- `lib/email/types.ts`: Defines email event structures, payload interfaces, delivery status, and provider options.
- `lib/email/mailer.ts`: Provider contract supporting mock/deferred delivery modes.
- `lib/email/outbox.ts`: Durable transactional outbox logic, state transitions, deduplication/idempotency key hashing, and retry policies.
- `tests/email-outbox.test.mjs`: Node test suite validating outbox enqueueing, payload schema validation, idempotency constraints, and mock provider delivery.

#### Proposed Implementation Strategy
1. **Event Schema & Payload Contract (`lib/email/types.ts`)**:
   - Define strongly typed event names (e.g. `inquiry.received`, `inquiry.assigned`, `quote.requested`).
   - Standardize `EmailOutboxEvent` metadata envelope: `id`, `event_type`, `payload`, `idempotency_key`, `status` ('pending' | 'processing' | 'sent' | 'failed'), `attempts`, `last_error`, `created_at`, `updated_at`.
   - Define contract for deferred vs mock providers (`EmailProviderClient`, `MockEmailProvider`, `DeferredEmailProvider`).
2. **Provider Contract & Mock Implementation (`lib/email/mailer.ts`)**:
   - Provide standard provider interface with send method returning delivery receipts or deferral tokens.
   - Ensure mock/deferred providers support deterministic error simulation and receipt inspection for testing.
3. **Idempotency & Outbox Management (`lib/email/outbox.ts`)**:
   - Implement idempotency key generation and duplicate event deduplication logic.
   - Enforce transactional safety rules and error handling without mutating production databases.
4. **Verification & Tests (`tests/email-outbox.test.mjs`)**:
   - Verify payload schema validation rejects malformed payloads.
   - Verify duplicate `idempotency_key` dispatches are safely ignored or return the existing event record.
   - Verify mock provider records outgoing events accurately.

#### Verification Plan
- Run unit test suite: `node --test tests/email-outbox.test.mjs`
- Ensure no lint/TypeScript regressions in affected files.

Owned paths: lib/email/types.ts, lib/email/mailer.ts, lib/email/outbox.ts, tests/email-outbox.test.mjs
