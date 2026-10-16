# Product backlog

Roadmap approval: APPROVED

Only Antigravity adds tasks from a roadmap approved by the user. Use a unique lowercase task ID without spaces. Dependencies are comma-separated IDs or `-`; a commit hash is `-` until committed. Keep acceptance criteria concise here and detailed in each `PLAN.md`.

| Task ID | Priority | Dependencies | Owner | Status | Acceptance criteria | Commit hash |
| --- | --- | --- | --- | --- | --- | --- |
| inquiry-service-layer | P0 | - | Codex | READY | Inquiry validation, atomic PostgreSQL RPC, outbox queuing, and admin data access | - |
| storefront-inquiry-forms | P0 | inquiry-service-layer | Codex | BACKLOG | Quote submission in cart, product inquiry button, and general contact form | - |
| admin-inquiry-portal | P0 | inquiry-service-layer | Codex | BACKLOG | Admin inquiry table, status filters, detail drawer, internal notes, and shell navigation | - |
| email-outbox-dispatch | P1 | inquiry-service-layer | Codex | BACKLOG | Outbox worker with locking, exponential retry, and mock/staging mailer | - |
| storefront-consultant-zalo | P1 | storefront-inquiry-forms | Codex | BACKLOG | Consultant profile directory, public Zalo direct contact integration, and admin management | - |
