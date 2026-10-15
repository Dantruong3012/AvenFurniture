# AvenFurniture

A furniture inquiry storefront built with Next.js 16, React, TypeScript, Supabase, and Cloudinary.

The storefront currently uses demo catalog data. Admin category/product management uses real Supabase data with SSR authentication and RLS. JWT 900 seconds, disabled public signup and rotation remain unchanged from Phase 0. See the [Phase 1 catalog report](src/docs/12-phase1-catalog.md) for features, access, migrations and test evidence. This is not a production-ready release.

## Local development

Install dependencies with `npm ci`, then run `npm run dev` and open [localhost:3000](http://localhost:3000).

Configure the variable names listed in `.env.example` in your existing `.env.local`. Preserve the Cloudinary values already there. Admin routes require the Supabase URL/publishable key; do not commit `.env.local` or use secret keys in browser code.

See the [MVP plan](src/docs/07-mvp-plan.md) and [Supabase integration status, migration review, and Auth setup](src/docs/08-supabase-integration.md). The initial migrations were explicitly approved and applied on 14 October 2026. Admin access requires an explicitly provisioned active profile; there is no public admin registration.

## Validation

```sh
npm run lint
npx tsc --noEmit
npm test
npm run build
npm run check:supabase
```

Database tests use isolated in-memory PostgreSQL and do not touch Supabase production. The connection check reads remote Auth settings and prints only safe status fields. See [session security status](src/docs/09-session-security.md) for live checks and remaining Auth setup.

See the [Phase 0 acceptance report](src/docs/11-phase0-acceptance.md) for verified results, remaining manual checks and deferred email delivery.
