# Implementation brief: collections-associations

Store and validate collection to product associations without Production migration

## Authorized files

- lib/types.ts
- lib/validation/catalog.ts
- lib/catalog/actions.ts
- lib/catalog/queries.ts
- components/admin/catalog-form.tsx
- tests/catalog.test.mjs

## Requirements

## Task: collections-associations  ### Objective & Architecture Store and validate collection-to-product associations without running any Production migrations. Leverage existing catalog structures and validation routines (`lib/validation/catalog.ts`, `lib/catalog/actions.ts`, `lib/catalog/queries.ts`, `lib/types.ts`) or provide local schema migration definitions (`supabase/migrations/`) strictly for local/CI environments while maintaining backward compatibility with the existing database interface.  ### Proposed Changes 1. **Schema & Validation**:    - Update `lib/validation/catalog.ts` to include schema validation for collection-product associations (ensuring valid product IDs and collection identifiers, validating relationship integrity and constraints).    - Update `lib/types.ts` to declare collection-product association interfaces and payload types. 2. **Catalog Domain Logic**:    - Update `lib/catalog/actions.ts` to handle saving and updating collection associations with proper validation and error handling.    - Update `lib/catalog/queries.ts` to support querying products within collections, resolving collection associations, and handling unassociated products gracefully. 3.

## Acceptance criteria

Store and validate collection to product associations without Production migration
