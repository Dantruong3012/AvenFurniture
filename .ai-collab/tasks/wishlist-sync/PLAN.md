# Plan: wishlist-sync

Status: APPROVED

# Task Plan: wishlist-sync

## 1. Goal Description
Implement authenticated wishlist synchronization across devices with guest migration support, mirroring the existing customer cart synchronization pattern.

## 2. Acceptance Criteria
- Authenticated customer wishlist synchronizes across devices and persists in Supabase.
- Guest wishlist items stored in local state/storage are migrated and merged when the user authenticates.
- Wishlist operations (add, remove, query) work for both guest and authenticated users gracefully.
- Row-Level Security (RLS) ensures users can only access and modify their own wishlist items.
- Full unit and integration test coverage for wishlist synchronization, migration policies, and API route behavior.

## 3. Architecture & Proposed Changes
1. **Database Migration (`supabase/migrations/20261018010000_customer_wishlist_items.sql`)**:
   - Create `customer_wishlist_items` table (`id`, `user_id`, `product_id`, `created_at`).
   - Enable RLS policies: users can SELECT, INSERT, DELETE their own wishlist records.
   - Unique constraint on `(user_id, product_id)`.
2. **Repository & Server Layer (`lib/repositories/supabaseWishlistRepository.ts`, `lib/wishlist/policy.ts`)**:
   - Define data access methods for fetching, merging, adding, and removing wishlist items for authenticated users.
   - Implement deduplication and guest migration logic.
3. **API Route (`app/api/wishlist/sync/route.ts`)**:
   - Provide endpoint to synchronize local guest wishlist items with database on login/session initialization.
4. **Client & UI Integration (`app/wishlist/page.tsx`, `components/product/product-card.tsx`, `components/product/product-detail-client.tsx`, `components/store/store-provider.tsx`)**:
   - Connect client wishlist store to the sync API upon authentication.
   - Support seamless transition from guest local storage to synced user wishlist.
5. **Testing (`tests/wishlist-sync.test.mjs`)**:
   - Verify guest-to-authenticated merge logic, deduplication, conflict handling, and RLS / repository operations.

## 4. Verification Plan
- `npm test tests/wishlist-sync.test.mjs`
- `npm run lint`
- `npm run type-check` (or `tsc --noEmit`)
- `npm run build`

Owned paths: supabase/migrations/20261018010000_customer_wishlist_items.sql, lib/repositories/supabaseWishlistRepository.ts, lib/wishlist/policy.ts, app/api/wishlist/sync/route.ts, app/wishlist/page.tsx, components/store/store-provider.tsx, components/product/product-card.tsx, components/product/product-detail-client.tsx, tests/wishlist-sync.test.mjs
