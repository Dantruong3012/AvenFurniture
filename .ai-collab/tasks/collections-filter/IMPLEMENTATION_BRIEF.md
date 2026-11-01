# Implementation brief: collections-filter

Collection routes show only associated published products with filter and empty states

## Authorized files

- app/collections/page.tsx
- components/product/catalog-client.tsx
- lib/catalog/public.ts
- lib/catalog/queries.ts
- lib/validation/catalog.ts
- tests/catalog.test.mjs
- tests/e2e/catalog.spec.ts

## Requirements

# Implementation Plan: collections-filter  ## Objective Implement collection filtering so collection routes display only associated published products with filtering options (e.g. category, materials/attributes, sorting) and dedicated empty states when no products match or are associated with the collection.  ## Proposed Architecture & File Changes 1. **Catalog & Collection Query / Actions Layer**:    - `lib/catalog/queries.ts`: Update/add queries to fetch collections, filter products by collection ID/slug, and ensure published status enforcement (`is_published: true`).    - `lib/catalog/public.ts`: Expose public collection retrieval helpers and collection-specific filter criteria.    - `lib/validation/catalog.ts`: Validate collection filter query parameters (category, sort, status).  2. **Storefront Collections Route & Components**:    - `app/collections/page.tsx`: Render collection browsing/detail view or listing with support for collection-specific views and query parameters.    - `components/product/catalog-client.tsx`: Ensure existing filter components can accept collection context / initial filters, or reuse catalog filter mechanics for collection-filtered views.    - Add emp

## Acceptance criteria

Collection routes show only associated published products with filter and empty states
