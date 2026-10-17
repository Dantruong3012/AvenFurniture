# Implementation brief: email-notification-templates

Email templates for customer confirmation, consultant assignment and status changes via outbox worker

## Authorized files

- lib/email/templates.ts
- lib/email/types.ts
- lib/email/outbox.ts
- tests/email-templates.test.mjs
- tests/email-outbox.test.mjs

## Requirements

# Task Plan: email-notification-templates  ## Objective Implement structured, reusable, and type-safe HTML/plain-text email templates for customer confirmation, consultant assignment, and inquiry status changes to be dispatched via the existing email outbox worker.  ## Proposed Architecture & File Ownership - `lib/email/templates.ts`: Introduce template renderers for:   1. Customer confirmation (`customer_confirmation`): Acknowledgement of received inquiry/quote with itemized details and customer greeting.   2. Consultant assignment (`consultant_assignment`): Notification to assigned consultant containing inquiry ID, customer name, contact details, notes, and direct admin link.   3. Status changes (`status_update`): Updates to customer or internal staff when inquiry status transitions (e.g. NEW -> IN_REVIEW -> QUOTED -> CLOSED). - `lib/email/types.ts`: Extend payload types and template enum/identifiers to support template data binding and structured parameters. - `lib/email/outbox.ts`: Integrate template resolution into the outbox payload processing or message formatting before queue dispatch. - `tests/email-templates.test.mjs`: Unit and snapshot/content tests verifying HTML and te

## Acceptance criteria

Email templates for customer confirmation, consultant assignment and status changes via outbox worker
