# Remaining feature reconciliation

Status: APPROVED by Antigravity review `3510f20c-9c0b-46a9-a17c-95edd6ff8d2c`. This inventory is based on `src/docs/`, `docs/`, source, tests and the existing task artifacts. A `DONE` row in the old backlog means that row's scoped acceptance passed, not that its whole feature group is finished. `Scope approval: NEEDS_DECISION` is an execution gate; dependency completion alone never changes it.

The current MVP documents specify only `super_admin` and `staff`, an inquiry cart, and no checkout or customer account. The owner's latest request expands the desired roadmap to orders, payments, and cross-device sync, but leaves the provider, identity and database decisions open. New local migration files may be reviewed as code; applying them to the shared Supabase project needs separate approval.

## Gap evidence

| Group | Verified current state | Missing acceptance |
| --- | --- | --- |
| Staff accounts | `components/admin/team-management.tsx` is a read-only preview; `admin_profiles` and last-admin DB guard exist. | Invite/create, role and active changes, safe delete, Auth/session handling and audit. |
| Newsletter | No subscription route, consent store, or unsubscribe flow. | Explicit consent, durable subscription, suppression and privacy controls. |
| Journal | `/inspiration` renders five title/summary cards with inert Read story buttons. | Approved article bodies, links, detail routes and publication rules. |
| Collections | `lib/data/editorial.ts` has three static cards; `/collections` has no product association/filter. | Durable association, published-only filtering and empty states. |
| Email | Outbox worker, templates, mock/staging/console mailers, and worker-level health/scoped retry helpers exist. | Admin health surface, approved retry control, durable change events, Production provider, scheduler and end-to-end delivery proof. |
| Inquiry assignment | Repository supports `assignee_id`; admin UI/action does not change it. | Assign/unassign active staff, audit and safe validation. |
| Orders/payment | Out of scope per owner directive (2026-10-17). AvenFurniture is a furniture showroom and consultation site with Zalo contact and quote-request cart; no checkout, orders or payment integration. | None (removed from roadmap). |
| Cart/wishlist sync | Both persist in localStorage on one browser only. | Approved customer identity and cross-device persistence/conflict handling. |
| Release pipeline | GitHub PR/CI, controlled merge and Vercel observer adapters exist. Production release flag is off. | Connected PR/CI lifecycle, controlled activation and exact deployment tracking. Safe dev push is handled separately in this runner upgrade. |

## Task specifications

Priority and dependencies are in `BACKLOG.md`. `BACKLOG` with `APPROVED` means eligible for Antigravity planning; it is not `READY` until a real approved plan exists. File paths below are ownership candidates for planning, not a license to edit other paths. Every task requires lint, typecheck, unit/integration tests and build. No task may write to shared Supabase or Production during tests.

| Task | Acceptance and test plan | Candidate ownership | Security constraint |
| --- | --- | --- | --- |
| inquiry-assignment | Both roles can assign/unassign an existing inquiry to active staff; invalid/inactive IDs fail, changes audit, UI refreshes. Unit action/repository tests and local DB fixture. | `components/admin/inquiry-portal.tsx`, `lib/inquiries/actions.ts`, `lib/repositories/supabaseInquiryRepository.ts`, `lib/types.ts`, `tests/admin-inquiry.test.mjs` | Server verifies active admin and assignee; no shared DB writes. |
| outbox-operations | Worker-level counts and scoped retry helper preserve leases and avoid live mail in tests; admin UI is a separate follow-up. Unit tests use fake mailer/local fixture. | `lib/email/outbox.ts`, `tests/email-outbox.test.mjs` | No live delivery during tests. |
| outbox-admin-health | Admin page shows aggregate pending, processing, sent, failed, due and dead-letter counts; anonymous users cannot read it; no message bodies or delivery mutation. Server/action tests use local mocks. | `app/admin/(protected)/inquiries/page.tsx`, `components/admin/inquiry-portal.tsx`, `lib/email/outbox.ts`, `tests/admin-inquiry.test.mjs`, `tests/email-outbox.test.mjs` | Verify active admin session server-side; no shared DB write. |
| outbox-admin-retry | Under approved provider/scheduler policy, authorized admin can request scoped retry for failed IDs with CSRF/rate and audit; tests prove no direct send. | `app/admin/`, `lib/email/`, `tests/` | No live email or Production outbox mutation during tests. |
| email-event-schema-policy | Owner approves durable event type/payload representation and transactional enqueue path for assignment/status changes. | `src/docs/02-architecture.md`, `src/docs/03-features.md` | No Production schema/RLS change before approval. |
| email-change-events | Assignment and status changes enqueue exactly one durable notification event in the same transaction; failure leaves consistent state; local DB tests. | `lib/inquiries/`, `lib/email/`, `supabase/migrations/`, `tests/` | Local migration only; no live mail or Production migration. |
| staff-auth-policy | Owner selects invite and hard/soft deletion semantics, session revocation and RLS/Auth change boundaries; plan states last-admin invariant. Decision recorded before coding. | `src/docs/03-features.md`, `src/docs/09-session-security.md` | No Auth or RLS change before approval. |
| staff-invite | Super admin invite creates consistent Auth/profile state, handles resend/cancel and partial failure; staff and anonymous rejected. Local mock Auth tests. | `components/admin/team-management.tsx`, `lib/auth/`, `tests/auth-session.test.mjs` | Never expose service key, invite token or account enumeration. |
| staff-role-status | Role/active mutations audit, protect final active super admin, reject staff, and apply approved session policy. Local Auth/RLS tests. | `components/admin/team-management.tsx`, `lib/auth/`, `tests/auth-session.test.mjs` | No privilege escalation or live account mutation in tests. |
| staff-delete | Approved delete/deactivate path preserves inquiry notes and audit references; tests cover last admin and linked records. | `components/admin/team-management.tsx`, `lib/auth/`, `tests/auth-session.test.mjs` | No cascade deleting business history. |
| newsletter-data-policy | Owner approves consent text, retention, suppression and schema/RLS; decision artifact. | `src/docs/01-scope.md`, `src/docs/03-features.md` | No marketing from inquiry consent. |
| newsletter-subscribe | Validated public form/API persists explicit opt-in idempotently; abuse/duplicate cases tested locally. | `app/`, `components/`, `lib/`, `supabase/migrations/`, `tests/` | No Production migration; rate-limit and data minimization. |
| newsletter-unsubscribe | Signed link revokes consent; replay safe, tamper and expired tests; suppressed users not mailed. | `app/`, `lib/`, `tests/` | Never leak subscriber existence or token. |
| journal-content-policy | Owner approves article copy and source; no invented editorial text. | `src/docs/03-features.md` | No unapproved external CMS credentials. |
| journal-articles | Listing cards open article detail with approved content; unknown/unpublished slug is 404; metadata and link tests. | `app/inspiration/`, `lib/data/editorial.ts`, `tests/storefront.test.mjs` | Public content only. |
| collections-data-policy | Owner approves relation cardinality, editor role, schema/RLS and Production migration path. | `src/docs/02-architecture.md`, `src/docs/03-features.md` | No RLS/Production change before approval. |
| collections-associations | Local schema/repository validates associations and permissions; local DB and repository tests. | `supabase/migrations/`, `lib/repositories/`, `tests/catalog.test.mjs` | Migration file only; unpublished products remain private. |
| collections-filter | Collection route filters associated published products; invalid slug/empty state tested. | `app/collections/`, `lib/catalog/`, `tests/storefront.test.mjs` | RLS remains authoritative. |
| email-delivery-policy | Owner selects provider/sender domain and scheduler/auth infrastructure; operational and cost decision recorded. | `src/docs/06-production.md` | No billing, credentials or Production config change. |
| email-provider-adapter | Provider adapter uses existing outbox retry/idempotency interface; failure/redaction tests. | `lib/email/`, `tests/email-outbox.test.mjs` | Secret server-side, no live send in tests. |
| outbox-scheduler | Protected scheduler dispatches bounded jobs and rejects unauthenticated requests; lease/retry tests. | `app/api/`, `lib/email/`, `tests/email-outbox.test.mjs` | No shared DB dispatch during tests. |
<!-- commerce-architecture, order-checkout, payment-integration removed 2026-10-17 per project owner directive. AvenFurniture has no online payments. Primary product CTA is Zalo direct contact (storefront-consultant-zalo, DONE). -->
| customer-identity-policy | Owner approves sign-in model, consent, guest merge and conflict rules, including Auth/RLS design. | `src/docs/07-mvp-plan.md`, `src/docs/09-session-security.md` | No customer Auth/RLS change before approval. |
| cart-sync | Authenticated cart syncs two devices and merges guest data per approved rule; local multi-session tests. | `app/cart/`, `components/cart/`, `lib/`, `tests/` | Users can access only own cart. |
| wishlist-sync | Authenticated wishlist syncs two devices and migrates guest list; local multi-session tests. | `app/wishlist/`, `components/`, `lib/`, `tests/` | Users can access only own wishlist. |
| release-pipeline-policy | Owner approves PR target/required CI, merge authorization and deployment tracking; Production stays manual. | `.ai-collab/release/` | No main merge or Production deploy. |
| release-pr-ci | PR reconciliation checks exact dev SHA and required CI, stops on failure; fake API tests. | `.ai-collab/release*.mjs`, `.ai-collab/orchestrator*.test.mjs` | No automatic merge; orchestration runner change requires separate review. |
| release-merge-tracking | Signed authorization gates exact merge and observer matches deployed SHA; fake API tests. | `.ai-collab/release*.mjs`, `.ai-collab/orchestrator*.test.mjs` | No automatic Production action without separate user approval. |

The current coordinator forbids `.ai-collab/` as a Codex source allowlist. The two release pipeline implementation rows must remain gated until an approved runner upgrade explicitly defines a safe owner and review path. A blocked checkpoint currently stops automatic selection; it is not silently skipped. Independent tasks can be resumed only through a separately reviewed safe checkpoint design.
