# Implementation brief: cart-sync

Guest quote-request cart synchronization across devices (no payment, inquiry model only)

## Authorized files

- supabase/migrations/20261018000000_customer_cart_items.sql
- lib/types.ts
- lib/cart/policy.ts
- lib/repositories/supabaseCartRepository.ts
- app/api/cart/sync/route.ts
- components/store/store-provider.tsx
- app/cart/page.tsx
- components/portal/customer-portal.tsx
- tests/cart-sync.test.mjs
- tests/database.test.mjs
- tests/e2e/cart.spec.ts

## Requirements

# Plan: cart-sync  Status: APPROVED Planner: Antigravity (Lead Architect)  ## Architectural Specification: Quote Cart Synchronization  ### 1. Identity & Synchronization Architecture - **Guest Quote Cart (Unauthenticated)**:   - Guests store their quote request list exclusively in browser `localStorage` (`aven-furniture-cart-v1`).   - No account creation or authentication is required for guests.   - Guests can add products, adjust quantities, remove items, clear their list, and submit quote requests directly through the quote inquiry modal.   - Browser fingerprinting, canvas/device inspection, or IP tracking are strictly forbidden.   - Guest share tokens or transferable cart links are NOT approved and shall NOT be implemented. - **Authenticated Customer Synchronization (Cross-Device Sync)**:   - Leverages `customer-identity-policy` and Supabase Auth session via `private.current_customer_id()`.   - When a customer signs in with a verified account, their quote list synchronizes across all their devices via database persistence.   - New table `public.customer_cart_items`:     - `user_id uuid not null references auth.users(id) on delete cascade`     - `product_id uuid not null reference

## Acceptance criteria

Guest quote-request cart synchronization across devices (no payment, inquiry model only)
