# Implementation: journal-articles

Status: READY_FOR_REVIEW
Changed paths: app/journal/page.tsx, app/journal/[slug]/page.tsx, app/sitemap.ts, components/journal/article-card.tsx, components/journal/article-detail.tsx, components/journal/markdown-renderer.tsx, lib/journal/articles.ts, lib/journal/types.ts, tests/journal-policy.test.mjs
Commit: feat(journal-articles): implement approved task
Commit hash: -

Implemented the journal listing, two static article pages, safe Markdown rendering, SEO metadata, sitemap entries, and a CTA to the Zalo consultant directory.

Verification: lint passed with one pre-existing warning; typecheck passed; all 172 tests passed; production build passed and generated both article routes statically; git diff --check passed. Article Markdown is embedded in lib/journal/articles.ts because content/journal is outside the authorized paths. No files were staged or committed.

## Independent checks

- npm run lint: PASS
- npm run typecheck: PASS
- npm test: PASS
- npm run build: PASS
