import assert from "node:assert/strict";
import { test } from "node:test";
import { loadModule } from "./helpers/load-module.mjs";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const nativeRequire = createRequire(import.meta.url);
function loadView(filename, overrides = {}) {
  const code = ts.transpileModule(readFileSync(path.join(root, filename), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  const require = (name) => name in overrides ? overrides[name] : nativeRequire(name);
  new Function("require", "module", "exports", code)(require, loaded, loaded.exports);
  return loaded.exports;
}

const journal = loadModule("lib/journal/articles.ts");

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

test("published Markdown loads in date order and resolves only known slugs", () => {
  const articles = journal.listJournalArticles();
  assert.ok(articles.length >= 2);
  assert.deepEqual(articles.map((article) => article.frontmatter.date), [...articles.map((article) => article.frontmatter.date)].sort().reverse());
  for (const article of articles) {
    assert.equal(journal.getJournalArticle(article.frontmatter.slug), article);
    assert.ok(article.body.includes("## "));
    assert.ok(article.readingMinutes >= 1);
  }
  assert.equal(journal.getJournalArticle("unknown-article"), undefined);
  assert.equal(journal.getJournalArticle("../a-quieter-kind-of-luxury"), undefined);
});

test("frontmatter parser rejects missing, malformed, and duplicate publication fields", () => {
  const valid = `---\nslug: sample-story\ntitle: Sample story\nexcerpt: A note\ndate: 2026-10-01\nlastUpdated: 2026-10-02\nauthor: Editor\nreviewer: Reviewer\ntags: ["Homes"]\ncoverImage: https://images.unsplash.com/photo-123\nseoTitle: Sample story\nseoDescription: A note\n---\n## Hello\n\nA short story.`;
  assert.equal(journal.parseJournalMarkdown(valid).frontmatter.slug, "sample-story");
  assert.throws(() => journal.parseJournalMarkdown("No frontmatter"), /frontmatter/);
  assert.throws(() => journal.parseJournalMarkdown(valid.replace("slug: sample-story\n", "")), /slug/);
  assert.throws(() => journal.parseJournalMarkdown(valid.replace("date: 2026-10-01", "date: 2026-02-30")), /date/);
  assert.throws(() => journal.parseJournalMarkdown(valid.replace("tags: [\"Homes\"]", "tags: [\"Homes\", \"Homes\"]")), /tags/);
  assert.throws(() => journal.parseJournalMarkdown(valid.replace("seoTitle: Sample story", "seoTitle: Sample story\nseoTitle: Again")), /frontmatter line/);
  assert.throws(() => journal.parseJournalMarkdown(valid.replace("coverImage: https://images.unsplash.com/photo-123", "coverImage: javascript:alert(1)")), /coverImage/);
  assert.throws(() => journal.parseJournalMarkdown(valid.replace("## Hello\n\nA short story.", "  ")), /Markdown body/);
});

test("listing and article metadata describe published content", async () => {
  const article = journal.listJournalArticles()[0];
  const listing = loadView("app/journal/page.tsx", {
    "@/components/journal/article-card": { ArticleCard() {} },
    "@/lib/journal/articles": journal,
  });
  assert.equal(listing.metadata.alternates.canonical, "/journal");
  assert.equal(listing.metadata.openGraph.type, "website");
  assert.equal(listing.metadata.twitter.card, "summary_large_image");

  const detail = loadView("app/journal/[slug]/page.tsx", {
    "next/navigation": { notFound() { throw new Error("Not found"); } },
    "@/components/journal/article-detail": { ArticleDetail() {} },
    "@/lib/journal/articles": journal,
  });
  assert.deepEqual(detail.generateStaticParams().map(({ slug }) => slug), journal.listJournalArticles().map(({ frontmatter }) => frontmatter.slug));
  const metadata = await detail.generateMetadata({ params: Promise.resolve({ slug: article.frontmatter.slug }) });
  assert.equal(metadata.title, article.frontmatter.seoTitle);
  assert.equal(metadata.description, article.frontmatter.seoDescription);
  assert.equal(metadata.alternates.canonical, `/journal/${article.frontmatter.slug}`);
  assert.equal(metadata.openGraph.type, "article");
  assert.equal(metadata.openGraph.publishedTime, article.frontmatter.date);
  assert.equal(metadata.twitter.images[0], article.frontmatter.coverImage);
  assert.equal((await detail.generateMetadata({ params: Promise.resolve({ slug: "unknown" }) })).robots.index, false);
  await assert.rejects(detail.default({ params: Promise.resolve({ slug: "unknown" }) }), /Not found/);
});

test("sitemap includes the listing and each published article", async () => {
  const sitemap = loadView("app/sitemap.ts", {
    "@/lib/repositories/supabaseProductRepository": { listPublicCategories: async () => [], listSitemapProducts: async () => [] },
    "@/lib/catalog/site-url": { siteOrigin: () => "https://aven.example" },
    "@/lib/journal/articles": journal,
  }).default;
  const entries = await sitemap();
  assert.ok(entries.some(({ url }) => url === "https://aven.example/journal"));
  for (const article of journal.listJournalArticles()) {
    assert.ok(entries.some(({ url, lastModified }) => url === `https://aven.example/journal/${article.frontmatter.slug}` && lastModified === article.frontmatter.lastUpdated));
  }
});

test("article cards show publication details and detail pages lead to the Zalo consultant directory", () => {
  const article = journal.listJournalArticles()[0];
  const viewImports = {
    "next/image": { __esModule: true, default: ({ alt }) => React.createElement("img", { alt }) },
    "next/link": { __esModule: true, default: ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children) },
  };
  const { ArticleCard } = loadView("components/journal/article-card.tsx", viewImports);
  const card = renderToStaticMarkup(React.createElement(ArticleCard, { article }));
  assert.match(card, new RegExp(article.frontmatter.title));
  assert.match(card, new RegExp(article.frontmatter.excerpt));
  assert.match(card, /<time dateTime="2026-10-01"/);
  assert.match(card, /Homes · Ideas/);
  assert.match(card, /<img alt=/);
  assert.match(card, /href="\/journal\/a-quieter-kind-of-luxury"/);

  const { ArticleDetail } = loadView("components/journal/article-detail.tsx", {
    ...viewImports,
    "./markdown-renderer": loadView("components/journal/markdown-renderer.tsx"),
  });
  const detail = renderToStaticMarkup(React.createElement(ArticleDetail, { article }));
  assert.match(detail, /min read/);
  assert.match(detail, /Reviewed by AvenFurniture editorial team/);
  assert.match(detail, /href="\/consultants"/);
  assert.match(detail, /Find a consultant on Zalo/);
});

test("Markdown renders supported blocks and escapes HTML and unsafe links", () => {
  const { MarkdownRenderer } = loadView("components/journal/markdown-renderer.tsx");
  const html = renderToStaticMarkup(React.createElement(MarkdownRenderer, { source: "## Heading\n\n- First\n- Second\n\n1. One\n2. Two\n\n> Quoted\n\n```js\n<script>alert(1)</script>\n```\n\n[Safe](/consultants) [External](https://example.com) [Unsafe](javascript:alert) <img src=x onerror=alert(1)>" }));
  assert.match(html, /<h2/);
  assert.match(html, /<ul/);
  assert.match(html, /<ol/);
  assert.match(html, /<blockquote/);
  assert.match(html, /<pre/);
  assert.match(html, /href="\/consultants"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /&lt;script&gt;/);
});
