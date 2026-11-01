# Plan: storefront-consultant-zalo

Status: APPROVED

# Implementation Plan: storefront-consultant-zalo

## Goal Description
Implement public consultant directory with direct Zalo contact links and protected admin management interface using existing `consultant_profiles` schema and `public.list_public_consultants()` RPC without database modifications or live production calls.

## Acceptance Criteria
1. Storefront Directory:
   - Dedicated page at `app/consultants/page.tsx` displaying active consultants via `public.list_public_consultants()`.
   - Card component showing `public_name`, optional `avatar_url`, and validated direct link `https://zalo.me/<phone>`.
   - Empty state handled gracefully when no consultants are returned.
   - Header navigation updated to link to `/consultants` (`components/layout/header.tsx`).
2. Protected Admin Management:
   - Admin route at `app/admin/(protected)/consultants/page.tsx` linked into `components/admin/catalog-shell.tsx`.
   - Manage profiles linked to `admin_profiles.user_id`: edit `public_name`, `avatar_url`, `zalo_phone`, `sort_order`, and `enabled` flag (defaulting to false).
   - Validate phone format against constraint `^[+]?[0-9]{9,15}$`.
   - Role and RLS enforcement compliant with existing admin auth.
3. Architecture & Data Integrity:
   - No DB migrations or schema adjustments; rely strictly on existing Supabase types and tables.
   - No Auth user creation or direct production DB writes during testing.
4. Testing & Verification:
   - Local unit and integration tests covering Zalo URL generation, phone validation, query mapping, server actions, and UI rendering.
   - All tests passing along with TypeScript check, linting, and Next.js build.

## Proposed Changes
- `lib/validation/consultant.ts`: Zod validation schemas for consultant profile updates and phone constraint regex (`^[+]?[0-9]{9,15}$`).
- `lib/consultants/queries.ts` & `lib/repositories/supabaseConsultantRepository.ts`: Query functions for storefront (`list_public_consultants`) and admin profile listings.
- `lib/consultants/actions.ts`: Server actions for admin create/update/delete/order/toggle visibility.
- `components/consultant/zalo-contact-button.tsx`: Formatted Zalo link button with sanitized URL.
- `components/consultant/consultant-card.tsx` & `components/consultant/consultant-grid.tsx`: UI display components for storefront directory.
- `app/consultants/page.tsx`: Public storefront consultant directory page.
- `components/admin/consultant-form.tsx` & `components/admin/consultant-management.tsx`: Admin management table and edit modals/forms.
- `app/admin/(protected)/consultants/page.tsx`: Admin dashboard page for consultants.
- `components/layout/header.tsx`: Navigation link to `/consultants`.
- `components/admin/catalog-shell.tsx`: Admin sidebar navigation link to `/admin/consultants`.
- `tests/consultant.test.mjs` & `tests/admin-consultant.test.mjs`: Test suites with mocks for public storefront and admin operations.

## Verification Plan
- Unit tests: `node --test tests/consultant.test.mjs tests/admin-consultant.test.mjs`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Build: `npm run build`

Owned paths: components/layout/header.tsx, components/admin/catalog-shell.tsx, app/consultants/page.tsx, app/admin/(protected)/consultants/page.tsx, components/consultant/consultant-card.tsx, components/consultant/consultant-grid.tsx, components/consultant/zalo-contact-button.tsx, components/admin/consultant-form.tsx, components/admin/consultant-management.tsx, lib/consultants/actions.ts, lib/consultants/queries.ts, lib/repositories/supabaseConsultantRepository.ts, lib/validation/consultant.ts, tests/admin-consultant.test.mjs, tests/consultant.test.mjs
