# Product backlog

Roadmap approval: APPROVED

Only Antigravity adds tasks from a roadmap approved by the user. Use a unique lowercase task ID without spaces. Dependencies are comma-separated IDs or `-`; a commit hash is `-` until committed. Keep acceptance criteria concise here and detailed in each `PLAN.md`.

| Task ID | Priority | Dependencies | Owner | Status | Acceptance criteria | Commit hash |
| --- | --- | --- | --- | --- | --- | --- |
| inquiry-service-layer | P0 | - | Codex | DONE | Inquiry validation, atomic PostgreSQL RPC, outbox queuing, and admin data access | ec164cb3990d2b2d7d0e7fcd4072d9d65934e215 |
| storefront-inquiry-forms | P0 | inquiry-service-layer | Codex | DONE | Quote submission in cart, product inquiry button, and general contact form | a723e2128077abb50481343820c867618a278bdb |
| admin-inquiry-portal | P0 | inquiry-service-layer | Codex | DONE | Admin inquiry table, status filters, detail drawer, internal notes, and shell navigation | b8856827b6fbe9a0769ee419470623b2c2a8be30 |
| email-outbox-dispatch | P1 | inquiry-service-layer | Codex | DONE | Outbox worker with locking, exponential retry, and mock/staging mailer | d334ac5c23d3d41d0f22848a11d06260c6bd751e |
| storefront-consultant-zalo | P1 | storefront-inquiry-forms | Codex | BACKLOG | Consultant profile directory, public Zalo direct contact integration, and admin management | - |
