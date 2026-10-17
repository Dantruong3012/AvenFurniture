# Plan: collections-associations

Status: APPROVED

## Task: collections-associations

### Objective & Architecture
Store and validate collection-to-product associations without running any Production migrations. Leverage existing catalog structures and validation routines (`lib/validation/catalog.ts`, `lib/catalog/actions.ts`, `lib/catalog/queries.ts`, `lib/types.ts`) or provide local schema migration definitions (`supabase/migrations/`) strictly for local/CI environments while maintaining backward compatibility with the existing database interface.

### Proposed Changes
1. **Schema & Validation**:
   - Update `lib/validation/catalog.ts` to include schema validation for collection-product associations (ensuring valid product IDs and collection identifiers, validating relationship integrity and constraints).
   - Update `lib/types.ts` to declare collection-product association interfaces and payload types.
2. **Catalog Domain Logic**:
   - Update `lib/catalog/actions.ts` to handle saving and updating collection associations with proper validation and error handling.
   - Update `lib/catalog/queries.ts` to support querying products within collections, resolving collection associations, and handling unassociated products gracefully.
3. **Admin & UI Integration**:
   - Update `components/admin/catalog-form.tsx` or related catalog admin views to support selecting and persisting associated products for a collection.
4. **Test Suite**:
   - Add/update unit and integration tests in `tests/catalog.test.mjs` verifying association validation rules (invalid IDs, duplicate associations, valid persistence payloads).

### Acceptance Criteria
1. Collection to product associations can be defined, validated, and stored via catalog validation and actions.
2. Invalid product IDs or malformed association payloads are rejected with descriptive validation errors.
3. Fetching collections includes associated product IDs/records, resolving correctly in queries.
4. No production database migration is executed or required for existing supported workflows.
5. All tests in `tests/catalog.test.mjs` pass cleanly alongside lint and TypeScript checks.

Owned paths: lib/types.ts, lib/validation/catalog.ts, lib/catalog/actions.ts, lib/catalog/queries.ts, components/admin/catalog-form.tsx, tests/catalog.test.mjs
