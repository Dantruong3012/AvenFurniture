# Plan: collections-data-policy

Status: APPROVED

# Task Plan: collections-data-policy

## Goal
Approve collection catalog taxonomy, association policy, and filter schema without database migrations, establishing an application-level taxonomy and deterministic association rules that preserve database compatibility.

## Acceptance Criteria
1. Define collection catalog taxonomy structure (slugs, titles, descriptions, metadata) in `lib/types.ts` and `lib/validation/catalog.ts`.
2. Define deterministic collection association rules/policy mapping products (via existing categories, tags, or attribute filters) to collections without requiring database schema changes or migrations.
3. Implement filter schema and parsing utilities in `lib/validation/catalog.ts` and `lib/catalog/queries.ts` supporting collection filtering.
4. Update storefront collection catalog resolver in `lib/catalog/public.ts` and ensure `app/collections/page.tsx` renders collections using the agreed taxonomy.
5. Add comprehensive unit tests in `tests/catalog.test.mjs` verifying taxonomy validation, association policies, and filter query edge cases.

## Scope & File Ownership
- `lib/types.ts`: Define collection types, taxonomy interfaces, and filter query types.
- `lib/validation/catalog.ts`: Zod schemas for collection definitions, filter params, and validation.
- `lib/catalog/queries.ts`: Query helper functions to filter products by collection association rules.
- `lib/catalog/public.ts`: Public helper exports for collections.
- `app/collections/page.tsx`: Integrate collection taxonomy and display logic.
- `tests/catalog.test.mjs`: Unit tests verifying collection taxonomy, association policy, and filter schemas.

## Verification Strategy
- Run node test runner: `node --test tests/catalog.test.mjs`
- Run type checking: `npm run type-check` or `npx tsc --noEmit`
- Run linting: `npm run lint`

Owned paths: lib/types.ts, lib/validation/catalog.ts, lib/catalog/queries.ts, lib/catalog/public.ts, app/collections/page.tsx, tests/catalog.test.mjs
