# Plan: collections-filter

Status: APPROVED

# Implementation Plan: collections-filter

## Objective
Implement collection filtering so collection routes display only associated published products with filtering options (e.g. category, materials/attributes, sorting) and dedicated empty states when no products match or are associated with the collection.

## Proposed Architecture & File Changes
1. **Catalog & Collection Query / Actions Layer**:
   - `lib/catalog/queries.ts`: Update/add queries to fetch collections, filter products by collection ID/slug, and ensure published status enforcement (`is_published: true`).
   - `lib/catalog/public.ts`: Expose public collection retrieval helpers and collection-specific filter criteria.
   - `lib/validation/catalog.ts`: Validate collection filter query parameters (category, sort, status).

2. **Storefront Collections Route & Components**:
   - `app/collections/page.tsx`: Render collection browsing/detail view or listing with support for collection-specific views and query parameters.
   - `components/product/catalog-client.tsx`: Ensure existing filter components can accept collection context / initial filters, or reuse catalog filter mechanics for collection-filtered views.
   - Add empty states handling: Display clear empty state UI when a collection has no published products or when active filters yield zero products.

3. **Automated Verification & Tests**:
   - `tests/catalog.test.mjs`: Unit/integration tests asserting that collection queries only return published products associated with the collection, and that filtering/empty states produce expected results.
   - `tests/e2e/catalog.spec.ts`: E2E test verifying collection route navigation, filter adjustments, empty state rendering, and exclusion of unpublished or unassociated products.

## Acceptance Criteria
- Collection routes resolve and show only published products associated with the targeted collection.
- Active filters (e.g., categories, sorting) correctly narrow down the collection product list.
- An empty state is cleanly displayed when no products match the selected filters or if the collection contains no published products.
- Unpublished or draft products are strictly excluded from public collection results.
- All test suites (`tests/catalog.test.mjs`, `tests/e2e/catalog.spec.ts`) pass without requiring Production actions or credentials.

Owned paths: app/collections/page.tsx, components/product/catalog-client.tsx, lib/catalog/public.ts, lib/catalog/queries.ts, lib/validation/catalog.ts, tests/catalog.test.mjs, tests/e2e/catalog.spec.ts
