# Implementation brief: journal-content-policy

Approve article copy, publication source, editorial ownership, static Markdown schema, SEO and Zalo CTA

## Authorized files

- lib/data/editorial.ts
- lib/types.ts
- tests/journal-policy.test.mjs

## Requirements

### Goal Establish the journal content policy, editorial ownership model, publication source rules, static Markdown frontmatter schema, and SEO/Zalo CTA specifications for article content without requiring production changes or remote infrastructure.  ### Acceptance Criteria 1. Article copy standards, tone of voice, and publication source (local static Markdown) are formally specified. 2. Editorial ownership fields (author, reviewer, publication date, last updated date) are defined in static Markdown schema/types. 3. Schema defines required frontmatter properties (slug, title, excerpt, date, author, tags, coverImage, seoTitle, seoDescription, zaloCtaText, zaloCtaPhone/Link). 4. Static schema validation and metadata contracts for SEO and Zalo inquiry CTA are implemented and covered by unit tests.  ### Implementation Scope - Update `lib/types.ts` to include `JournalArticle` and `JournalFrontmatter` interfaces with editorial metadata, SEO fields, and Zalo CTA configuration. - Update or export article validation and policy helper functions in `lib/data/editorial.ts`. - Add unit test suite in `tests/journal-policy.test.mjs` verifying schema validation, mandatory editorial ownership prop

## Acceptance criteria

Approve article copy, publication source, editorial ownership, static Markdown schema, SEO and Zalo CTA
