# Implementation brief: newsletter-unsubscribe

Signed token unsubscribe route revoking subscriber consent safely without leaking list data

## Authorized files

- app/api/newsletter/unsubscribe/route.ts
- app/newsletter/unsubscribe/page.tsx
- lib/newsletter/actions.ts
- lib/newsletter/policy.ts
- lib/newsletter/types.ts
- tests/newsletter-policy.test.mjs

## Requirements

### Acceptance Criteria - Provide a cryptographic or secure HMAC-signed token generation and verification mechanism for newsletter unsubscriptions. - Signed unsubscribe route revokes subscriber consent safely in the database/repository without leaking whether an arbitrary email is registered or on the list. - Timing-safe / privacy-preserving error responses on invalid, expired, or malformed tokens. - Provide an unsubscribe confirmation landing page or status handler for subscriber user experience. - Cover token validation, signature tampering, expiration, and idempotent revocation with unit/integration tests in tests/newsletter-policy.test.mjs.

## Acceptance criteria

Signed token unsubscribe route revoking subscriber consent safely without leaking list data
