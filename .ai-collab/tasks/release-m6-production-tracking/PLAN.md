# Plan: release-m6-production-tracking

Status: APPROVED

# Task Plan: release-m6-production-tracking

## Acceptance Criteria
- Vercel Production deployment observer tracks deployment status matching the merged target commit SHA.
- Includes robust status checking (e.g., READY, BUILDING, ERROR, CANCELED) and polling/observation logic.
- Graceful handling of API errors and edge cases with React error boundary integration.
- Automated unit/integration tests verifying deployment status resolution, commit matching, and boundary error trapping without executing Production actions.

## Architecture & Implementation Scope
1. **Vercel Client & Types (`lib/vercel/types.ts`, `lib/vercel/deployment.ts`)**:
   - Define TypeScript interfaces for deployment statuses, metadata, and observer responses.
   - Implement client functions to query deployment status for a given commit SHA and branch/target.
   - Ensure non-mutating/read-only observer behavior to maintain Production safety.
2. **UI Observer Component (`components/admin/deployment-observer.tsx`, `components/ui/error-boundary.tsx`)**:
   - Create `components/ui/error-boundary.tsx` to isolate runtime observer failures.
   - Implement `DeploymentObserver` component to visually display tracking status, commit SHA link/badge, and error states.
3. **Automated Tests (`tests/vercel-deployment.test.mjs`)**:
   - Mock Vercel API responses (matched commit, building, ready, failed, missing deployment).
   - Validate error handling and error boundary fallback behaviors.

## Verification Plan
- Run `npm test tests/vercel-deployment.test.mjs`
- Run `npm run lint` and `npm run build`

Owned paths: lib/vercel/deployment.ts, lib/vercel/types.ts, components/admin/deployment-observer.tsx, components/ui/error-boundary.tsx, tests/vercel-deployment.test.mjs
