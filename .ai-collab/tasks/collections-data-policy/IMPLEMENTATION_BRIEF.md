# Implementation brief: collections-data-policy

Approve collection catalog taxonomy, association policy and filter schema without database migrations

## Authorized files

- lib/types.ts
- lib/validation/catalog.ts
- lib/catalog/queries.ts
- lib/catalog/public.ts
- app/collections/page.tsx
- tests/catalog.test.mjs

## Requirements

# Task Plan: collections-data-policy  ## Goal Approve collection catalog taxonomy, association policy, and filter schema without database migrations, establishing an application-level taxonomy and deterministic association rules that preserve database compatibility.  ## Acceptance Criteria 1. Define collection catalog taxonomy structure (slugs, titles, descriptions, metadata) in `lib/types.ts` and `lib/validation/catalog.ts`. 2. Define deterministic collection association rules/policy mapping products (via existing categories, tags, or attribute filters) to collections without requiring database schema changes or migrations. 3. Implement filter schema and parsing utilities in `lib/validation/catalog.ts` and `lib/catalog/queries.ts` supporting collection filtering. 4. Update storefront collection catalog resolver in `lib/catalog/public.ts` and ensure `app/collections/page.tsx` renders collections using the agreed taxonomy. 5. Add comprehensive unit tests in `tests/catalog.test.mjs` verifying taxonomy validation, association policies, and filter query edge cases.  ## Scope & File Ownership - `lib/types.ts`: Define collection types, taxonomy interfaces, and filter query types. - `lib/

## Acceptance criteria

Approve collection catalog taxonomy, association policy and filter schema without database migrations
