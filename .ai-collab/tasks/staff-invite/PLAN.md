# Plan: staff-invite

Status: APPROVED

Expanding the authorized paths to include supabase/migrations/20261017210000_staff_invite_lifecycle.sql and lib/supabase/database.types.ts is safe and within the approved scope for the staff-invite task. These changes represent local migration and generated TypeScript definitions needed for the retry-safe Auth and profile lifecycle without triggering Production database migrations, secret updates, or deployment actions.

Owned paths: lib/auth/admin.ts, lib/auth/actions.ts, lib/auth/validation.ts, components/admin/team-management.tsx, app/admin/(protected)/team/page.tsx, tests/staff-auth-policy.test.mjs, supabase/migrations/20261017210000_staff_invite_lifecycle.sql, lib/supabase/database.types.ts
