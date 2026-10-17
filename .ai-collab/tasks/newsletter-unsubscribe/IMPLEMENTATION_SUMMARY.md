# Implementation summary: newsletter-unsubscribe

## Changed files

- app/api/newsletter/unsubscribe/route.ts
- app/newsletter/unsubscribe/page.tsx
- lib/newsletter/actions.ts
- lib/newsletter/policy.ts
- tests/newsletter-policy.test.mjs

## Behavior and evidence

Implemented encrypted, HMAC-signed unsubscribe links with 30-day expiry, an idempotent revocation route, and a confirmation page.

Invalid, expired, and malformed links receive the same public confirmation response. The raw database bearer token is encrypted inside the link, preventing direct use of the public RPC to bypass link expiry. Verification passed: 199 tests, lint (0 errors; 2 existing coordinator-file warnings), typecheck, production build, and git diff --check. Existing subscription code has no email delivery integration; the signing helper is ready for that integration. No files were staged or committed.

## Limitations / review questions

None reported
