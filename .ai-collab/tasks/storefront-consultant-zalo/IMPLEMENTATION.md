# Implementation: storefront-consultant-zalo

Status: READY_FOR_REVIEW
Changed paths: components/layout/header.tsx, components/admin/catalog-shell.tsx, app/consultants/page.tsx, app/admin/(protected)/consultants/page.tsx, components/consultant/consultant-card.tsx, components/consultant/consultant-grid.tsx, components/consultant/zalo-contact-button.tsx, components/admin/consultant-form.tsx, components/admin/consultant-management.tsx, lib/consultants/actions.ts, lib/consultants/queries.ts, lib/repositories/supabaseConsultantRepository.ts, lib/validation/consultant.ts, tests/admin-consultant.test.mjs, tests/consultant.test.mjs
Commit: feat(storefront-consultant-zalo): implement approved task
Commit hash: -

Completed the consultant directory, validated Zalo links, protected admin management, and local test coverage.

Completed existing partial task work. Public directory uses list_public_consultants(), exposes only public fields, validates Zalo links and optional Cloudinary avatars, and handles empty/error states. Admin management requires super_admin authorization, uses the authenticated session client, supports creation/editing/deletion/order/visibility, defaults new profiles to hidden, and checks updated_at to reject stale mutations. Validation follows existing dependency-free repository conventions; no Zod dependency was added.

Verification: targeted consultant suites passed 18/18 tests; npm run lint passed; npm run typecheck passed; npm test passed 121/121 tests; npm run build passed and lists both consultant routes as dynamic; git diff --check passed. Tests cover validation, public mapping, authorization, intercepted real Supabase request construction, mutation failures, stale edits, pagination, UI rendering, and draft preservation.

No live Production calls, migrations, credential changes, MCP usage, staging, commits, pushes, deployments, or artifact edits were performed. Existing coordinator artifacts were preserved. Git index remains unstaged. Browser/live-service verification was not performed.

## Independent checks

- npm run lint: PASS
- npm run typecheck: PASS
- npm test: PASS
- npm run build: PASS
