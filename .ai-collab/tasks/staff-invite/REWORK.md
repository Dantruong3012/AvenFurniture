# Rework: staff-invite

Round: 2

## Root cause

Root cause: 'existing' at line 57 is never reassigned, causing a prefer-const ESLint failure. Unused variables 'spawn' and 'implPath' also generated warnings. Smallest correction: change declaration of 'existing' to 'const' and remove/clean up unused variables.

## Required correction

Root cause: 'existing' at line 57 is never reassigned, causing a prefer-const ESLint failure. Unused variables 'spawn' and 'implPath' also generated warnings. Smallest correction: change declaration of 'existing' to 'const' and remove/clean up unused variables.

## Files

- lib/auth/admin.ts
- lib/auth/actions.ts
- lib/auth/validation.ts
- components/admin/team-management.tsx
- app/admin/(protected)/team/page.tsx
- tests/staff-auth-policy.test.mjs
- supabase/migrations/20261017210000_staff_invite_lifecycle.sql
- lib/supabase/database.types.ts
