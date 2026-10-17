import assert from "node:assert/strict";
import { test } from "node:test";
import { loadModule } from "./helpers/load-module.mjs";

const { journalContentPolicy, validateJournalFrontmatter, validateJournalArticle, journalSeoMetadata, journalZaloCta } = loadModule("lib/data/editorial.ts");

const frontmatter = (overrides = {}) => ({
  slug: "why-walnut-endures",
  title: "Why walnut endures",
  excerpt: "A closer look at the warmth and grain of walnut in daily living.",
  date: "2026-10-01",
  author: "Mai Le",
  reviewer: "AvenFurniture editorial team",
  lastUpdated: "2026-10-03",
  tags: ["Materials", "Craft"],
  coverImage: "/journal/walnut.jpg",
  seoTitle: "Why walnut endures | AvenFurniture",
  seoDescription: "Explore walnut's natural grain and how it brings warmth to considered interiors.",
  zaloCtaText: "Ask us about walnut furniture on Zalo",
  zaloCtaPhone: "+84901234567",
  ...overrides,
});

test("journal policy names the static source, editorial owner, review rule and copy standards", () => {
  assert.equal(journalContentPolicy.publicationSource, "local-static-markdown");
  assert.equal(journalContentPolicy.publicationPath, "content/journal/<slug>.md");
  assert.match(journalContentPolicy.publicationRule, /filename must match/);
  assert.match(journalContentPolicy.editorialOwner, /AvenFurniture/);
  assert.match(journalContentPolicy.voice, /Warm/);
  assert.ok(journalContentPolicy.copyStandards.some((rule) => /Attribute quotations/.test(rule)));
  assert.match(journalContentPolicy.reviewRule, /named reviewer/);
});

test("frontmatter and Markdown body validate editorial ownership and required schema", () => {
  const parsed = validateJournalFrontmatter(frontmatter());
  assert.equal(parsed.author, "Mai Le");
  assert.equal(parsed.reviewer, "AvenFurniture editorial team");
  assert.equal(parsed.lastUpdated, "2026-10-03");
  assert.deepEqual(validateJournalArticle({ frontmatter: frontmatter(), body: "# Walnut\n\nThe grain has character." }).frontmatter, parsed);
  assert.throws(() => validateJournalArticle({ frontmatter: frontmatter(), body: "  " }), /Markdown body/);
  for (const key of ["slug", "title", "excerpt", "date", "author", "reviewer", "lastUpdated", "tags", "coverImage", "seoTitle", "seoDescription", "zaloCtaText"]) {
    const invalid = frontmatter();
    delete invalid[key];
    assert.throws(() => validateJournalFrontmatter(invalid), new RegExp(key), key);
  }
});

test("frontmatter rejects invalid dates, slugs, tags, images and unexpected fields", () => {
  for (const [key, value] of Object.entries({
    slug: "Bad/Slug", date: "2026-02-30", lastUpdated: "2026-09-30",
    tags: ["Craft", "craft"], coverImage: "javascript:alert(1)",
  })) assert.throws(() => validateJournalFrontmatter(frontmatter({ [key]: value })), new RegExp(key));
  assert.throws(() => validateJournalFrontmatter(frontmatter({ draft: true })), /unexpected draft/);
  assert.throws(() => validateJournalFrontmatter(null), /object required/);
});

test("SEO metadata uses the approved title, description, image and publication dates", () => {
  const article = validateJournalFrontmatter(frontmatter());
  const metadata = journalSeoMetadata(article);
  assert.equal(metadata.title, article.seoTitle);
  assert.equal(metadata.description, article.seoDescription);
  assert.deepEqual(metadata.authors, [{ name: article.author }]);
  assert.deepEqual(metadata.openGraph, {
    type: "article", title: article.seoTitle, description: article.seoDescription,
    publishedTime: article.date, modifiedTime: article.lastUpdated,
    authors: [article.author], tags: article.tags,
    images: [{ url: article.coverImage, alt: article.title }],
  });
  assert.deepEqual(metadata.twitter, {
    card: "summary_large_image", title: article.seoTitle,
    description: article.seoDescription, images: [article.coverImage],
  });
});

test("Zalo CTA requires a safe phone or Zalo link and exposes safe anchor attributes", () => {
  const article = validateJournalFrontmatter(frontmatter());
  assert.deepEqual(journalZaloCta(article), {
    text: article.zaloCtaText, href: "https://zalo.me/84901234567",
    target: "_blank", rel: "noopener noreferrer",
  });
  const linked = validateJournalFrontmatter(frontmatter({ zaloCtaPhone: undefined, zaloCtaLink: "https://zalo.me/84987654321" }));
  assert.equal(journalZaloCta(linked).href, "https://zalo.me/84987654321");
  assert.throws(() => validateJournalFrontmatter(frontmatter({ zaloCtaPhone: undefined })), /zaloCtaPhone or zaloCtaLink/);
  assert.throws(() => validateJournalFrontmatter(frontmatter({ zaloCtaPhone: "+84 901234567" })), /zaloCtaPhone/);
  assert.throws(() => validateJournalFrontmatter(frontmatter({ zaloCtaLink: "https://zalo.me.evil.example/84987654321" })), /zaloCtaLink/);
  assert.throws(() => validateJournalFrontmatter(frontmatter({ zaloCtaLink: "http://zalo.me/84987654321" })), /zaloCtaLink/);
});
