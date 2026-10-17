# Plan: email-notification-templates

Status: APPROVED

# Task Plan: email-notification-templates

## Objective
Implement structured, reusable, and type-safe HTML/plain-text email templates for customer confirmation, consultant assignment, and inquiry status changes to be dispatched via the existing email outbox worker.

## Proposed Architecture & File Ownership
- `lib/email/templates.ts`: Introduce template renderers for:
  1. Customer confirmation (`customer_confirmation`): Acknowledgement of received inquiry/quote with itemized details and customer greeting.
  2. Consultant assignment (`consultant_assignment`): Notification to assigned consultant containing inquiry ID, customer name, contact details, notes, and direct admin link.
  3. Status changes (`status_update`): Updates to customer or internal staff when inquiry status transitions (e.g. NEW -> IN_REVIEW -> QUOTED -> CLOSED).
- `lib/email/types.ts`: Extend payload types and template enum/identifiers to support template data binding and structured parameters.
- `lib/email/outbox.ts`: Integrate template resolution into the outbox payload processing or message formatting before queue dispatch.
- `tests/email-templates.test.mjs`: Unit and snapshot/content tests verifying HTML and text rendering, fallback values, escaping, and required fields for each template.
- `tests/email-outbox.test.mjs`: Verify end-to-end payload building and template dispatch in the outbox workflow.

## Acceptance Criteria
1. Renderers support both HTML and accessible text versions for:
   - Customer confirmation
   - Consultant assignment
   - Status changes
2. Email payload schema enforces required fields and template metadata without breaking existing mailer or outbox types.
3. Templates handle edge cases safely (missing optional fields, multiple items, special characters escaped in HTML).
4. Automated tests pass with zero production actions or schema alterations required.

## Verification
- Run test suites covering email templates and outbox: `node --test tests/email-templates.test.mjs tests/email-outbox.test.mjs`
- Type-check via `npm run type-check` (or `tsc --noEmit`) and linting.

Owned paths: lib/email/templates.ts, lib/email/types.ts, lib/email/outbox.ts, tests/email-templates.test.mjs, tests/email-outbox.test.mjs
