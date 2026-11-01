# Plan: storefront-consultant-zalo

Status: APPROVED
Planner: Antigravity CLI
Task: storefront-consultant-zalo
CLI conversation: acbb9b1a-c03b-452d-b86c-af5a673e9660
User scope approval: Use the four existing consultant profile fields and existing schema; do not change the database.

The public directory lists only enabled consultant profiles returned by `public.list_public_consultants()`. Show the public name, optional avatar and a validated `https://zalo.me/<phone>` contact link. Do not claim biography or specialty fields exist. An empty list is a valid storefront state.

The protected admin interface manages profiles linked to existing `admin_profiles.user_id` records. It may edit `public_name`, `avatar_url`, `zalo_phone`, `sort_order`, and `enabled`, subject to the current role checks and RLS. `enabled` defaults to false. Validate the database phone constraint `^[+]?[0-9]{9,15}$`. Do not create Auth users, change Auth settings or RLS, or write to the shared database during automated tests.

The table primary key is `consultant_profiles.user_id`, which references `admin_profiles.user_id`. The public RPC returns only `public_name`, `avatar_url`, `zalo_phone`, and `sort_order` for enabled profiles with active admin accounts. Use the existing generated Supabase types; no type or migration edit is needed.

Acceptance criteria: storefront directory and Zalo links, protected admin create/update/order/visibility/delete flows within existing permissions, local mocked tests for validation/query/actions/UI, passing lint/typecheck/test/build. No live database writes, push or deployment in this task.

Owned paths: components/layout/header.tsx, components/admin/catalog-shell.tsx, app/consultants/page.tsx, app/admin/(protected)/consultants/page.tsx, components/consultant/consultant-card.tsx, components/consultant/consultant-grid.tsx, components/consultant/zalo-contact-button.tsx, components/admin/consultant-form.tsx, components/admin/consultant-management.tsx, lib/consultants/actions.ts, lib/consultants/queries.ts, lib/repositories/supabaseConsultantRepository.ts, lib/validation/consultant.ts, tests/admin-consultant.test.mjs, tests/consultant.test.mjs
