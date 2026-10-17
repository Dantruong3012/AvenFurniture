# Implementation summary: newsletter-data-policy

## Changed files

- supabase/migrations/20261017180000_newsletter_data_policy.sql
- lib/supabase/database.types.ts
- lib/newsletter/types.ts
- lib/newsletter/policy.ts
- lib/newsletter/actions.ts
- tests/newsletter-policy.test.mjs
- tests/database.test.mjs

## Behavior and evidence

Implemented the newsletter data policy and strengthened its verification.

The schema records consent and hashed metadata, stores a unique digest of the unsubscribe token, restricts roster reads to staff with a current session, and defines retention cleanup. Tests verify token-only unsubscribe, access rules, malformed digests, and retention of active subscribers. npm test passed (196 tests); typecheck and build passed; lint passed with two existing coordinator-file warnings. No migration was applied. Newsletter email delivery is not wired, so the generated unsubscribe token is not yet sent to recipients.

## Limitations / review questions

None reported
