# Plan: cart-sync

Status: APPROVED
Planner: Antigravity (Lead Architect)

## Architectural Specification: Quote Cart Synchronization

### 1. Identity & Synchronization Architecture
- **Guest Quote Cart (Unauthenticated)**:
  - Guests store their quote request list exclusively in browser `localStorage` (`aven-furniture-cart-v1`).
  - No account creation or authentication is required for guests.
  - Guests can add products, adjust quantities, remove items, clear their list, and submit quote requests directly through the quote inquiry modal.
  - Browser fingerprinting, canvas/device inspection, or IP tracking are strictly forbidden.
  - Guest share tokens or transferable cart links are NOT approved and shall NOT be implemented.
- **Authenticated Customer Synchronization (Cross-Device Sync)**:
  - Leverages `customer-identity-policy` and Supabase Auth session via `private.current_customer_id()`.
  - When a customer signs in with a verified account, their quote list synchronizes across all their devices via database persistence.
  - New table `public.customer_cart_items`:
    - `user_id uuid not null references auth.users(id) on delete cascade`
    - `product_id uuid not null references public.products(id) on delete cascade`
    - `quantity integer not null check (quantity between 1 and 999)`
    - `created_at timestamptz not null default now()`
    - `updated_at timestamptz not null default now()`
    - Primary key `(user_id, product_id)`
    - Strict Row-Level Security (RLS) policies ensuring customers only read, insert, update, and delete their own items (`user_id = (select private.current_customer_id())`). Insert requires `product_id` to reference a published product.
- **Local-to-Server Merge & Conflict Resolution**:
  - Upon user sign-in, the client automatically merges items from `localStorage` into the server cart:
    - If a product exists in both local and server carts: add quantities together, capped at 999 (`Math.min(999, serverQuantity + localQuantity)`).
    - If a product exists only locally: insert into the server cart.
    - If a product exists only on the server: retain in the server cart.
    - Bounded collection size: maximum 100 distinct items per cart.
    - Malformed, negative, or unpublished item references are filtered out.
  - The merged cart is persisted to Supabase and reflected in client storage.
  - On sign-out: local storage retains current quote items without deleting them or making server calls.
- **Commercial & Inquiry Boundaries**:
  - AvenFurniture does NOT offer online checkout or online payment processing.
  - The cart serves as a Quote Request list (danh sách yêu cầu báo giá). Direct consultant conversation via Zalo remains the primary purchase consultation path.

### 2. Implementation Scope & File Ownership
- `supabase/migrations/20261018000000_customer_cart_items.sql`: Schema definition for `customer_cart_items` with RLS, foreign keys, triggers, and permissions.
- `lib/types.ts`: TypeScript contracts for customer cart items, sync requests, and merge results.
- `lib/cart/policy.ts`: Pure functions for cart merge resolution, quantity capping, deduplication, and input validation without fingerprinting.
- `lib/repositories/supabaseCartRepository.ts`: Supabase repository for reading, upserting, removing, and clearing customer cart items.
- `app/api/cart/sync/route.ts`: Secure API route for synchronizing customer carts with authenticated session enforcement.
- `components/store/store-provider.tsx`: Updated StoreProvider handling localStorage for guests and seamless background sync for authenticated customers.
- `app/cart/page.tsx`: Quote list UI rendering for guests and authenticated customers.
- `components/portal/customer-portal.tsx`: Customer portal integration for reviewing active quote selections.
- `tests/cart-sync.test.mjs`: Unit test suite covering merge logic, conflict resolution, boundary conditions, and session validation.
- `tests/database.test.mjs`: Updated database test verifying 16 public RLS-enabled tables and RLS isolation on `customer_cart_items`.
- `tests/e2e/cart.spec.ts`: End-to-end tests verifying guest quote list functionality and quote inquiry submission.

Owned paths: supabase/migrations/20261018000000_customer_cart_items.sql, lib/types.ts, lib/cart/policy.ts, lib/repositories/supabaseCartRepository.ts, app/api/cart/sync/route.ts, components/store/store-provider.tsx, app/cart/page.tsx, components/portal/customer-portal.tsx, tests/cart-sync.test.mjs, tests/database.test.mjs, tests/e2e/cart.spec.ts
