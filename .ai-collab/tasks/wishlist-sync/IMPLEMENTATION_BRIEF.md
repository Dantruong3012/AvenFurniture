# Implementation brief: wishlist-sync

Authenticated wishlist synchronizes across devices with guest migration

## Authorized files

- supabase/migrations/20261018010000_customer_wishlist_items.sql
- lib/repositories/supabaseWishlistRepository.ts
- lib/wishlist/policy.ts
- app/api/wishlist/sync/route.ts
- app/wishlist/page.tsx
- components/store/store-provider.tsx
- components/product/product-card.tsx
- components/product/product-detail-client.tsx
- tests/wishlist-sync.test.mjs

## Requirements

# Task Plan: wishlist-sync  ## 1. Goal Description Implement authenticated wishlist synchronization across devices with guest migration support, mirroring the existing customer cart synchronization pattern.  ## 2. Acceptance Criteria - Authenticated customer wishlist synchronizes across devices and persists in Supabase. - Guest wishlist items stored in local state/storage are migrated and merged when the user authenticates. - Wishlist operations (add, remove, query) work for both guest and authenticated users gracefully. - Row-Level Security (RLS) ensures users can only access and modify their own wishlist items. - Full unit and integration test coverage for wishlist synchronization, migration policies, and API route behavior.  ## 3. Architecture & Proposed Changes 1. **Database Migration (`supabase/migrations/20261018010000_customer_wishlist_items.sql`)**:    - Create `customer_wishlist_items` table (`id`, `user_id`, `product_id`, `created_at`).    - Enable RLS policies: users can SELECT, INSERT, DELETE their own wishlist records.    - Unique constraint on `(user_id, product_id)`. 2. **Repository & Server Layer (`lib/repositories/supabaseWishlistRepository.ts`, `lib/wishlist/polic

## Acceptance criteria

Authenticated wishlist synchronizes across devices with guest migration
