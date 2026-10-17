# Product backlog

Roadmap approval: APPROVED

Only Antigravity adds tasks from a roadmap approved by the user. Use a unique lowercase task ID without spaces. Dependencies are comma-separated IDs or `-`; a commit hash is `-` until committed. Keep acceptance criteria concise here and detailed in each `PLAN.md`.

| Task ID | Priority | Dependencies | Owner | Status | Acceptance criteria | Commit hash |
| --- | --- | --- | --- | --- | --- | --- |
| inquiry-service-layer | P0 | - | Codex | DONE | Inquiry validation, atomic PostgreSQL RPC, outbox queuing, and admin data access | ec164cb3990d2b2d7d0e7fcd4072d9d65934e215 |
| storefront-inquiry-forms | P0 | inquiry-service-layer | Codex | DONE | Quote submission in cart, product inquiry button, and general contact form | a723e2128077abb50481343820c867618a278bdb |
| admin-inquiry-portal | P0 | inquiry-service-layer | Codex | DONE | Admin inquiry table, status filters, detail drawer, internal notes, and shell navigation | b8856827b6fbe9a0769ee419470623b2c2a8be30 |
| email-outbox-dispatch | P1 | inquiry-service-layer | Codex | DONE | Outbox worker with locking, exponential retry, and mock/staging mailer | d334ac5c23d3d41d0f22848a11d06260c6bd751e |
| storefront-consultant-zalo | P1 | storefront-inquiry-forms | Codex | DONE | Consultant profile directory, public Zalo direct contact integration, and admin management | 24a596140c46f2c385a892ebb44d640a8564ac39 |
| admin-inquiry-export-metrics | P1 | admin-inquiry-portal | Codex | DONE | Inquiry metrics calculation, status aggregation, CSV export endpoint and admin analytics controls | 1298ba9be55d2405720d7542b0f0d79e4c8e296b |
| release-m4-github-ci | P1 | admin-inquiry-portal | Codex | BACKLOG | GitHub API adapter for PR reconciliation, CI status checks synchronization and changelog generation | - |
| release-m5-controlled-merge | P1 | release-m4-github-ci | Codex | BACKLOG | Controlled merge coordinator with signed authorization, branch protection and merge validation | - |
| release-m6-production-tracking | P1 | release-m5-controlled-merge | Codex | BACKLOG | Vercel Production deployment observer matching merged commit SHA with error boundary | - |
| storefront-customer-portal | P2 | inquiry-service-layer | Codex | BACKLOG | Customer order inquiry lookup portal, verification by phone or email and order history view | - |
| email-notification-templates | P1 | email-outbox-dispatch | Codex | BACKLOG | Email templates for customer confirmation, consultant assignment and status changes via outbox worker | - |

