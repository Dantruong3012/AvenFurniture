# Implementation brief: journal-articles

Working listing, article detail pages, static Markdown rendering, SEO metadata and Zalo CTA

## Authorized files

- app/journal/page.tsx
- app/journal/[slug]/page.tsx
- app/sitemap.ts
- components/journal/article-card.tsx
- components/journal/article-detail.tsx
- components/journal/markdown-renderer.tsx
- lib/journal/articles.ts
- lib/journal/types.ts
- tests/journal-policy.test.mjs

## Requirements

### Acceptance Criteria 1. **Listing Page (`app/journal/page.tsx`)**: Displays published journal articles with titles, excerpts, published dates, cover images, and tags. 2. **Detail Page (`app/journal/[slug]/page.tsx`)**: Dynamic route rendering individual articles with static Markdown parsing, formatted typography, reading time, and author metadata. 3. **Static Markdown Rendering**: Custom lightweight markdown renderer or integrated standard renderer (`components/journal/markdown-renderer.tsx`) supporting headers, lists, code blocks, blockquotes, and links safely. 4. **SEO Metadata**: Static and dynamic OpenGraph/Twitter metadata generated via Next.js metadata API for listing and detail pages, plus integration into `app/sitemap.ts`. 5. **Zalo CTA**: Prominent, accessible call-to-action component connecting readers to consultants via Zalo (`components/consultant/zalo-contact-button.tsx` or dedicated wrapper). 6. **Test Coverage**: Comprehensive tests in `tests/journal-policy.test.mjs` verifying article loading, slug resolution, frontmatter parsing, metadata correctness, and markdown rendering safety without requiring production database operations.

## Acceptance criteria

Working listing, article detail pages, static Markdown rendering, SEO metadata and Zalo CTA
