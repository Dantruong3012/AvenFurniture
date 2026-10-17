# Product backlog

Roadmap approval: APPROVED

Only Antigravity adds tasks from a roadmap approved by the user. Each task also requires explicit `Scope approval: APPROVED` in its row before the coordinator may plan or execute it; `NEEDS_DECISION` is never eligible. Use a unique lowercase task ID without spaces. Dependencies are comma-separated IDs or `-`; a commit hash is `-` until committed. Keep acceptance criteria concise here and detailed in each `PLAN.md`.

| Task ID | Priority | Dependencies | Owner | Status | Scope approval | Acceptance criteria | Commit hash |
| --- | --- | --- | --- | --- | --- | --- | --- |
| inquiry-service-layer | P0 | - | Codex | DONE | APPROVED | Inquiry validation, atomic PostgreSQL RPC, outbox queuing, and admin data access | ec164cb3990d2b2d7d0e7fcd4072d9d65934e215 |
| storefront-inquiry-forms | P0 | inquiry-service-layer | Codex | DONE | APPROVED | Quote submission in cart, product inquiry button, and general contact form | a723e2128077abb50481343820c867618a278bdb |
| admin-inquiry-portal | P0 | inquiry-service-layer | Codex | DONE | APPROVED | Admin inquiry table, status filters, detail drawer, internal notes, and shell navigation | b8856827b6fbe9a0769ee419470623b2c2a8be30 |
| email-outbox-dispatch | P1 | inquiry-service-layer | Codex | DONE | APPROVED | Outbox worker with locking, exponential retry, and mock/staging mailer | d334ac5c23d3d41d0f22848a11d06260c6bd751e |
| storefront-consultant-zalo | P1 | storefront-inquiry-forms | Codex | DONE | APPROVED | Consultant profile directory, public Zalo direct contact integration, and admin management | 24a596140c46f2c385a892ebb44d640a8564ac39 |
| admin-inquiry-export-metrics | P1 | admin-inquiry-portal | Codex | DONE | APPROVED | Inquiry metrics calculation, status aggregation, CSV export endpoint and admin analytics controls | 1298ba9be55d2405720d7542b0f0d79e4c8e296b |
| release-m4-github-ci | P1 | admin-inquiry-portal | Codex | DONE | APPROVED | GitHub API adapter for PR reconciliation, CI status checks synchronization and changelog generation | 789b51206a3009d4acee75aabd66c2f7c7446351 |
| release-m5-controlled-merge | P1 | release-m4-github-ci | Codex | DONE | APPROVED | Controlled merge coordinator with signed authorization, branch protection and merge validation | 3240800dc0f40cc077a018dce674f7403a019da0 |
| release-m6-production-tracking | P1 | release-m5-controlled-merge | Codex | DONE | APPROVED | Vercel Production deployment observer matching merged commit SHA with error boundary | 630795f7e0c2ee08ea9511562d26654a0f18b99f |
| storefront-customer-portal | P2 | inquiry-service-layer | Codex | DONE | APPROVED | Customer order inquiry lookup portal, verification by phone or email and order history view | 3b6a856d7d0403886ce0e0acc426b24a5ee9840d |
| email-notification-templates | P1 | email-outbox-dispatch | Codex | DONE | APPROVED | Email templates for customer confirmation, consultant assignment and status changes via outbox worker | 4692ce6fadc881bad871abda8fa100cdc23fa94d |
| inquiry-assignment | P0 | admin-inquiry-portal | Codex | APPROVED | APPROVED | Assign or unassign active staff in inquiry UI with server validation and audit | - |
| outbox-operations | P1 | email-outbox-dispatch | Codex | BACKLOG | APPROVED | Show outbox health and permit scoped retry through existing worker without sending live mail in tests | - |
| staff-auth-policy | P0 | - | Antigravity | BACKLOG | NEEDS_DECISION | Approve invite, role, disable and deletion policy including Auth session handling and RLS | - |
| staff-invite | P1 | staff-auth-policy | Codex | BACKLOG | NEEDS_DECISION | Super admin invites staff with retry safe Auth and profile lifecycle | - |
| staff-role-status | P1 | staff-auth-policy | Codex | BACKLOG | NEEDS_DECISION | Super admin updates role and active status with last admin and session safeguards | - |
| staff-delete | P2 | staff-auth-policy | Codex | BACKLOG | NEEDS_DECISION | Approved removal policy preserves inquiry and audit history | - |
| newsletter-data-policy | P1 | - | Antigravity | BACKLOG | NEEDS_DECISION | Approve consent, retention, unsubscribe, schema and RLS policy | - |
| newsletter-subscribe | P1 | newsletter-data-policy | Codex | BACKLOG | NEEDS_DECISION | Persist explicit opt in with validation, rate limits and idempotency | - |
| newsletter-unsubscribe | P1 | newsletter-subscribe | Codex | BACKLOG | NEEDS_DECISION | Signed unsubscribe revokes consent and prevents future marketing sends | - |
| journal-content-policy | P1 | - | Antigravity | BACKLOG | NEEDS_DECISION | Approve article copy, publication source and editorial ownership | - |
| journal-articles | P1 | journal-content-policy | Codex | BACKLOG | NEEDS_DECISION | Working listing and article detail links for approved published content | - |
| collections-data-policy | P1 | - | Antigravity | BACKLOG | NEEDS_DECISION | Approve collection associations, schema and RLS policy | - |
| collections-associations | P1 | collections-data-policy | Codex | BACKLOG | NEEDS_DECISION | Store and validate collection to product associations without Production migration | - |
| collections-filter | P1 | collections-associations | Codex | BACKLOG | NEEDS_DECISION | Collection routes show only associated published products with filter and empty states | - |
| email-delivery-policy | P1 | - | Antigravity | BACKLOG | NEEDS_DECISION | Choose provider, sender domain and scheduled dispatch infrastructure | - |
| email-provider-adapter | P1 | email-delivery-policy | Codex | BACKLOG | NEEDS_DECISION | Production mail adapter preserves outbox retries and secret isolation | - |
| outbox-scheduler | P1 | email-delivery-policy,email-outbox-dispatch | Codex | BACKLOG | NEEDS_DECISION | Authenticated scheduled dispatch safely claims pending outbox jobs | - |
| commerce-architecture | P1 | - | Antigravity | BACKLOG | NEEDS_DECISION | Approve order lifecycle, tax, shipping, inventory, payment provider and migration design | - |
| order-checkout | P2 | commerce-architecture | Codex | BACKLOG | NEEDS_DECISION | Persist server priced orders and idempotent checkout under approved model | - |
| payment-integration | P2 | order-checkout | Codex | BACKLOG | NEEDS_DECISION | Verified provider webhooks update payment and order state exactly once | - |
| customer-identity-policy | P1 | - | Antigravity | BACKLOG | NEEDS_DECISION | Approve customer identity, privacy, conflict and Auth or RLS model | - |
| cart-sync | P2 | customer-identity-policy | Codex | BACKLOG | NEEDS_DECISION | Authenticated cart synchronizes across devices with deterministic conflict resolution | - |
| wishlist-sync | P2 | customer-identity-policy | Codex | BACKLOG | NEEDS_DECISION | Authenticated wishlist synchronizes across devices with guest migration | - |
| release-pipeline-policy | P1 | - | Antigravity | BACKLOG | NEEDS_DECISION | Approve PR creation, CI contracts, controlled merge and deployment tracking activation | - |
| release-pr-ci | P1 | release-pipeline-policy | Codex | BACKLOG | NEEDS_DECISION | Reconcile dev PR and required CI without automatic merge | - |
| release-merge-tracking | P2 | release-pr-ci | Codex | BACKLOG | NEEDS_DECISION | Apply signed merge approval and track exact deployed SHA without autonomous Production deploy | - |

