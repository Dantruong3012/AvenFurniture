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
| inquiry-assignment | P0 | admin-inquiry-portal | Codex | DONE | APPROVED | Assign or unassign active staff in inquiry UI with server validation and audit | 11fbc234bfd797701ef0efb349e24aa932452425 |
| outbox-operations | P1 | email-outbox-dispatch | Codex | DONE | APPROVED | Worker-level outbox health counts and scoped retry helper with mock tests; admin UI tracked separately | 9a88117698afb8389a1e1307d9c22c61a4dfb84f |
| outbox-admin-health | P1 | outbox-operations | Codex | DONE | APPROVED | Authorized admin sees aggregate outbox health without message body exposure or delivery mutation | 0273768b8ce18a845f8738bb396d15e79af094e1 |
| outbox-admin-retry | P1 | outbox-admin-health,email-delivery-policy | Codex | BACKLOG | NEEDS_DECISION | Authorized admin can request selected failed-job retries under approved provider and scheduler policy | - |
| email-event-schema-policy | P1 | - | Antigravity | DONE | APPROVED | Approve durable event schema, payload model, mock/deferred provider contract, and idempotency rules | ad823ac31dc92e256bf1493c6e161a627139a2be |
| email-change-events | P1 | email-event-schema-policy,inquiry-assignment | Codex | DONE | APPROVED | Transactional event queueing for inquiry assignment and status updates with idempotency and mock delivery | 195ef51384322066e6e2b0c2cf73ae99bba942d1 |
| staff-auth-policy | P0 | - | Antigravity | DONE | APPROVED | Approve invite, role, disable and deletion policy including Auth session handling, super_admin lockout protection and RLS | 1044a672e851e0e548690098775182b8dfd83c40 |
| staff-invite | P1 | staff-auth-policy | Codex | BACKLOG | APPROVED | Super admin invites staff with retry safe Auth and profile lifecycle | - |
| staff-role-status | P1 | staff-auth-policy | Codex | BACKLOG | APPROVED | Super admin updates role and active status with last admin and session safeguards | - |
| staff-delete | P2 | staff-auth-policy | Codex | BACKLOG | APPROVED | Approved removal policy preserves inquiry and audit history | - |
| newsletter-data-policy | P1 | - | Antigravity | DONE | APPROVED | Approve newsletter subscriber schema, opt-in consent, retention, tokenized unsubscribe, and RLS policy | a85851084dee568971ea324c80915c62c57c5fc5 |
| newsletter-subscribe | P1 | newsletter-data-policy | Codex | DONE | APPROVED | Storefront newsletter subscription with email validation, rate limiting, duplicate prevention and opt-in audit | cc1f907af73aff202ddf0dbb51ec3b72b8cce4e7 |
| newsletter-unsubscribe | P1 | newsletter-subscribe | Codex | DONE | APPROVED | Signed token unsubscribe route revoking subscriber consent safely without leaking list data | d8b20336b45a032bf0c9361cdc4c56394253d073 |
| journal-content-policy | P1 | - | Antigravity | DONE | APPROVED | Approve article copy, publication source, editorial ownership, static Markdown schema, SEO and Zalo CTA | afc537e3ca750bdee2f9719f058533a00822389c |
| journal-articles | P1 | journal-content-policy | Codex | DONE | APPROVED | Working listing, article detail pages, static Markdown rendering, SEO metadata and Zalo CTA | 8623f7e3f626d1df587ac99ce87180f30797b2c5 |
| collections-data-policy | P1 | - | Antigravity | DONE | APPROVED | Approve collection catalog taxonomy, association policy and filter schema without database migrations | 8d1254f8dfb32e8cbda10bee6b510b09da7d4ecf |
| collections-associations | P1 | collections-data-policy | Codex | DONE | APPROVED | Store and validate collection to product associations without Production migration | 442c3f35cb03777162afe1ee3f00c20ac613e22a |
| collections-filter | P1 | collections-associations | Codex | DONE | APPROVED | Collection routes show only associated published products with filter and empty states | 9dea1114805e955c9563313de236382690b6cc34 |
| email-delivery-policy | P1 | - | Antigravity | BACKLOG | NEEDS_DECISION | Choose provider, sender domain and scheduled dispatch infrastructure | - |
| email-provider-adapter | P1 | email-delivery-policy | Codex | BACKLOG | NEEDS_DECISION | Production mail adapter preserves outbox retries and secret isolation | - |
| outbox-scheduler | P1 | email-delivery-policy,email-outbox-dispatch | Codex | BACKLOG | NEEDS_DECISION | Authenticated scheduled dispatch safely claims pending outbox jobs | - |
<!-- commerce-architecture, order-checkout, payment-integration removed 2026-10-17: AvenFurniture has no online payments. Primary product CTA is Zalo direct contact (storefront-consultant-zalo, DONE). -->
| customer-identity-policy | P1 | - | Antigravity | READY | APPROVED | Approve customer identity, privacy, conflict and Auth or RLS model (inquiry/wishlist only, no checkout) | - |
| cart-sync | P2 | customer-identity-policy | Codex | BACKLOG | APPROVED | Guest quote-request cart synchronization across devices (no payment, inquiry model only) | - |
| wishlist-sync | P2 | customer-identity-policy | Codex | BACKLOG | APPROVED | Authenticated wishlist synchronizes across devices with guest migration | - |
| release-pipeline-policy | P1 | - | Antigravity | BACKLOG | NEEDS_DECISION | Approve PR creation, CI contracts, controlled merge and deployment tracking activation | - |
| release-pr-ci | P1 | release-pipeline-policy | Codex | BACKLOG | NEEDS_DECISION | Reconcile dev PR and required CI without automatic merge | - |
| release-merge-tracking | P2 | release-pr-ci | Codex | BACKLOG | NEEDS_DECISION | Apply signed merge approval and track exact deployed SHA without autonomous Production deploy | - |

