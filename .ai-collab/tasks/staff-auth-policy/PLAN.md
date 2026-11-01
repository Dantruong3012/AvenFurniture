# Plan: staff-auth-policy

Status: APPROVED

## Task Implementation Plan: staff-auth-policy

### Objective
Implement and enforce staff invitation, role assignments (`super_admin`, `admin`, `editor`), disabling accounts, account deletion policies, session invalidation/handling, strict `super_admin` lockout protection (preventing self-demotion or self-deletion if the user is the sole remaining active super_admin), and comprehensive database Row Level Security (RLS) policies.

### Acceptance Criteria
1. **Staff Invite & Role Policy**: Authorized admins can invite new staff members with specified roles (`admin`, `editor`). Role validation ensures valid staff roles.
2. **Super Admin Lockout Protection**: Guarantee that the last remaining active `super_admin` cannot be disabled, deleted, or demoted to another role by themselves or any other operation.
3. **Disable & Deletion Policy**: Disabling or deleting a staff account immediately revokes active Auth sessions/tokens and prevents authentication/authorization.
4. **Auth Session Handling**: Session verification validates that disabled or deleted users cannot access protected administrative routes.
5. **RLS Enforcement**: Enforce RLS policies for staff profiles and admin tables so that permissions strictly follow role hierarchies.
6. **Testing & Verification**: Unit and integration tests covering invite, role transition, lockout safeguards, disable/delete flows, and session invalidation.

### File Changes
- `supabase/migrations/20261017193000_staff_auth_policy.sql`: Migration adding RLS policies, trigger checks for last super_admin lockout protection, and helper functions for staff management.
- `lib/auth/validation.ts`: Validation schemas for staff invites, role changes, and state transitions.
- `lib/auth/admin.ts` & `lib/auth/actions.ts`: Server actions and administration service methods for inviting staff, changing roles, disabling accounts, deleting staff, and revoking sessions.
- `lib/auth/session.ts`: Update session verification to assert active status against database profiles.
- `app/admin/(protected)/team/page.tsx` & `components/admin/team-management.tsx`: Admin UI components updated to reflect disable/delete/invite actions and prevent illegal super_admin modifications.
- `tests/staff-auth-policy.test.mjs`: Automated integration tests validating the policy constraints, lockout prevention, and session checks.

Owned paths: supabase/migrations/20261017193000_staff_auth_policy.sql, lib/auth/admin.ts, lib/auth/actions.ts, lib/auth/session.ts, lib/auth/validation.ts, app/admin/(protected)/team/page.tsx, components/admin/team-management.tsx, tests/staff-auth-policy.test.mjs
