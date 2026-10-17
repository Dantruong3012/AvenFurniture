# Implementation brief: email-event-schema-policy

Approve durable event schema, payload model, mock/deferred provider contract, and idempotency rules

## Authorized files

- lib/email/types.ts
- lib/email/mailer.ts
- lib/email/outbox.ts
- tests/email-outbox.test.mjs

## Requirements

### Task: email-event-schema-policy  #### Goal & Acceptance Criteria Approve durable event schema, payload model, mock/deferred provider contract, and idempotency rules for email events, ensuring offline/local verification without any Production database or third-party service actions.  #### Existing Context & Integration Points - `lib/email/types.ts`: Defines email event structures, payload interfaces, delivery status, and provider options. - `lib/email/mailer.ts`: Provider contract supporting mock/deferred delivery modes. - `lib/email/outbox.ts`: Durable transactional outbox logic, state transitions, deduplication/idempotency key hashing, and retry policies. - `tests/email-outbox.test.mjs`: Node test suite validating outbox enqueueing, payload schema validation, idempotency constraints, and mock provider delivery.  #### Proposed Implementation Strategy 1. **Event Schema & Payload Contract (`lib/email/types.ts`)**:    - Define strongly typed event names (e.g. `inquiry.received`, `inquiry.assigned`, `quote.requested`).    - Standardize `EmailOutboxEvent` metadata envelope: `id`, `event_type`, `payload`, `idempotency_key`, `status` ('pending'   'processing'   'sent'   'failed'), `at

## Acceptance criteria

Approve durable event schema, payload model, mock/deferred provider contract, and idempotency rules
