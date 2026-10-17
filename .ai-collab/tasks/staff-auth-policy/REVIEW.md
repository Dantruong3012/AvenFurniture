# Antigravity review: staff-auth-policy

Status: APPROVED
Reviewer: Antigravity CLI
Invocation: 3

Staff authentication policy, role hierarchy, lockout protection, and session revocation fully verified and approved.

All acceptance criteria have been satisfied: staff invitation and role assignment validate permissions strictly and prevent privilege escalation; last-active super admin lockout safeguards are enforced at database trigger and application layers; disabling or deleting accounts revokes sessions, clears refresh tokens, and bans or soft-deletes Auth credentials while preserving audit profiles; live session checks enforce active status and role matching; RLS policies correctly restrict access across super_admin, admin, and editor tiers; and all automated checks (lint, typecheck, tests, and production build) passed cleanly.
