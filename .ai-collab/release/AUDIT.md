# Release automation infrastructure audit

Date: 2026-10-16
Auditor: Codex
Scope: read-only infrastructure inspection before the release upgrade

## Observed repository state

- Repository: `Dantruong3012/AvenFurniture`, development branch `dev/aven-autonomous-backlog`, HEAD `faab317e3410d45436944dd25314472da62ac422`.
- No active coordinator lock was present. The current checkpoint is **BLOCKED / IN_PROGRESS**, task `admin-inquiry-portal`, sequence 3. Its plan conflicts with the database status constraint. This is a separate architecture blocker, not permission to reset or replan it.
- Pre-existing changes: `.ai-collab/BACKLOG.md`, `.ai-collab/STATE.md`, and the untracked `admin-inquiry-portal` task artifacts. Preserve them and the checkpoint.
- Existing inquiry and storefront implementation/metadata commits remain in history. The previous GitHub push is verified, but it does not imply GitHub API access or release permission.

## Capabilities retained

The coordinator already implements Antigravity Planning and Review, bounded source context, exact owned paths, independent lint/typecheck/application tests/build, Codex commit requests tied to Git parent/tree, fixed local commits, dependency ordering, a shared process lock, private execution receipts, quota pause/recovery, and narrow reviewed runner/replan recovery. Existing tests exercise these behaviors. It has no Preview/E2E/PR/CI/merge/Production release engine.

The current single development checkpoint gets reused for later tasks. Raw CLI receipts survive, but a complete prior test/commit checkpoint is not durably archived. M1 adds a separate immutable completion receipt at the verified task boundary; older Markdown alone must not be promoted into release authorization.

## GitHub inspection

Read-only public GitHub API responses:

- Repository endpoint: HTTP 200; public repository, default branch `main`.
- `branches/main`: HTTP 200, `protected: false`, protection disabled, no required contexts.
- `rulesets`: HTTP 200, empty list.
- `actions/workflows`: HTTP 200, `total_count: 0`.
- `branches/main/protection`: HTTP 401 without authenticated API access.

No `gh` executable or `GH_TOKEN`/`GITHUB_TOKEN` environment credential was available. Git HTTPS authentication previously worked through Git's own mechanism; do not extract its credentials or assume it grants API scopes. PR and CI adapters need supported API authentication. Branch protection and required checks must be configured before release can be enabled.

## Vercel inspection

Local `.vercel/repo.json` links `aven-furniture` / `prj_PyRDr0N6RUnKTeKWaum17vWfkmkY` in `team_TNVd8B1HyqiU94SchwMOUvBO` to `origin` at repository root. Latest observed Production deployment used `main` at `7454ca2`; the pushed dev revision created a non-Production Git deployment that failed its build.

The current explicit-team project API request returned **403 forbidden**. No Vercel CLI executable or `VERCEL_TOKEN` was available. Therefore the current Production Branch setting and Preview environment configuration are **not verified**, despite historical Production deployments from main. Do not infer branch tracking from deployment history. Reauthenticate to the correct team or configure a supported scoped CLI/API identity before M2's live verification. No settings were changed.

## Database and environment gates

Supabase MCP reports project URL `https://eofdtqnnqgxaoykcbfrv.supabase.co`, matching application Production configuration. Migration history contains the five migrations through `20261015085103_phase2_media_catalog`.

**Pending:** `20261016103000_inquiry_transaction.sql`. Read-only `to_regprocedure(...)` returned false for `public.submit_customer_inquiry(uuid,text,text,text,text,text,jsonb,jsonb)`. Inquiry/storefront code depends on this RPC. A release containing it is blocked until an operator approves and applies the migration separately, then a fresh audit verifies the schema. The function writes atomically to `inquiries`, `inquiry_items`, and `email_outbox`; it restricts execution to `service_role`. Isolated PGlite tests cover SQL, rollback, deduplication and grants. No Production SQL was applied.

Build requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Runtime also needs server-side Supabase/Cloudinary variables for relevant features. `lib/supabase/config.ts` currently hardcodes the Production project URL, and the operator confirms Local, Preview and Production intentionally share this project. Keep that architecture; no separate staging project is requested or authorized. Live automated probes must be read-only. Use local mock/disposable tests for write flows and clearly distinguish them from live coverage. Preview protection access and test account availability are not verified. No environment values were read or printed.

## Implementation boundary

Proceed with M1 code and local fixture proof only. Leave automatic release disabled and manual mode selected. M2–M8 require separate implementation/review evidence. Do not push this upgrade, create a PR, merge, deploy, change protections, or run Production migrations during this implementation phase.

## Admin inquiry constraint diagnosis (read-only follow-up)

A direct `pg_constraint` read confirms `inquiries_status_check` permits only `new`, `consulting`, `completed`, `cancelled`. The existing migration and repository validation use these values. The current admin plan instead requires `new`, `in_progress`, `resolved`, `archived`; sending its new values would fail the database constraint.

Preferred compatible proposal for Antigravity: revise the admin plan to use the four existing persisted statuses and suitable UI labels (New, Consulting, Completed, Cancelled), reusing current repository methods and tests. Do not map Archived to Cancelled silently: they have different meanings. If archiving is still required, define its semantics separately (including whether existing `deleted_at` is appropriate) before implementing it. This proposal requires a revised approved plan and the supported replan/runner-upgrade checks; the current checkpoint and plan remain unchanged. No database migration is needed merely to align the status UI with the existing enum-like constraint.

User approval remains required for applying the missing inquiry RPC migration, any schema/RLS/Auth change, shared-database test writes, environment changes, and Production release. Absence of staging is not grounds to create a project or change this architecture.
