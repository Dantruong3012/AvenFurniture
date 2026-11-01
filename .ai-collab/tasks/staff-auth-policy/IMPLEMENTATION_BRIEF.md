# Implementation brief: staff-auth-policy

Approve invite, role, disable and deletion policy including Auth session handling, super_admin lockout protection and RLS

## Authorized files

- supabase/migrations/20261017193000_staff_auth_policy.sql
- lib/auth/admin.ts
- lib/auth/actions.ts
- lib/auth/session.ts
- lib/auth/validation.ts
- app/admin/(protected)/team/page.tsx
- components/admin/team-management.tsx
- tests/staff-auth-policy.test.mjs

## Requirements

## Task Implementation Plan: staff-auth-policy  ### Objective Implement and enforce staff invitation, role assignments (`super_admin`, `admin`, `editor`), disabling accounts, account deletion policies, session invalidation/handling, strict `super_admin` lockout protection (preventing self-demotion or self-deletion if the user is the sole remaining active super_admin), and comprehensive database Row Level Security (RLS) policies.  ### Acceptance Criteria 1. **Staff Invite & Role Policy**: Authorized admins can invite new staff members with specified roles (`admin`, `editor`). Role validation ensures valid staff roles. 2. **Super Admin Lockout Protection**: Guarantee that the last remaining active `super_admin` cannot be disabled, deleted, or demoted to another role by themselves or any other operation. 3. **Disable & Deletion Policy**: Disabling or deleting a staff account immediately revokes active Auth sessions/tokens and prevents authentication/authorization. 4. **Auth Session Handling**: Session verification validates that disabled or deleted users cannot access protected administrative routes. 5. **RLS Enforcement**: Enforce RLS policies for staff profiles and admin tables so t

## Acceptance criteria

Approve invite, role, disable and deletion policy including Auth session handling, super_admin lockout protection and RLS
