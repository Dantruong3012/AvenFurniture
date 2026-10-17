import type { Collection } from "@/lib/types";
import type { JournalArticle, JournalFrontmatter } from "@/lib/types";
import type { Metadata } from "next";
import { zaloContactUrl } from "@/lib/validation/consultant";

/** Editorial rules for articles published from reviewed, local .md files. */
export const journalContentPolicy = {
  publicationSource: "local-static-markdown",
  publicationPath: "content/journal/<slug>.md",
  publicationRule: "Publish only reviewed Markdown files committed with the application; the filename must match the frontmatter slug.",
  editorialOwner: "AvenFurniture editorial team",
  voice: "Warm, observant, and specific; write for readers planning a home, not for a sales pitch.",
  copyStandards: [
    "Use original, useful descriptions of rooms, materials, makers, and practical choices.",
    "Attribute quotations and factual claims; verify names, materials, and product details before publication.",
    "Avoid unsupported sustainability, durability, price, and availability claims.",
    "Use a descriptive title and excerpt; keep the Zalo invitation relevant and optional.",
  ],
  reviewRule: "A named reviewer approves copy, SEO text, imagery, and the Zalo destination before the Markdown file is published; update lastUpdated after material edits.",
} as const;

const frontmatterKeys = new Set([
  "slug", "title", "excerpt", "date", "author", "reviewer", "lastUpdated", "tags",
  "coverImage", "seoTitle", "seoDescription", "zaloCtaText", "zaloCtaPhone", "zaloCtaLink",
]);

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredText(input: Record<string, unknown>, key: string, max: number): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim() || value.trim().length > max || value.includes("\0")) {
    throw new Error(`Invalid journal frontmatter: ${key}`);
  }
  return value.trim();
}

function calendarDate(input: Record<string, unknown>, key: string): string {
  const value = requiredText(input, key, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid journal frontmatter: ${key}`);
  }
  return value;
}

function imageSource(value: string): boolean {
  if (value.startsWith("/") && !value.startsWith("//") && !/[\\\s?#]/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !!url.hostname && !url.username && !url.password && !url.port && !/[\\\s]/.test(value);
  } catch { return false; }
}

function zaloLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "zalo.me" || url.hostname === "www.zalo.me") &&
      !url.port && !url.username && !url.password && url.pathname !== "/" && !/[\\\s]/.test(value);
  } catch { return false; }
}

/** Validate parsed YAML frontmatter before a local Markdown article is published. */
export function validateJournalFrontmatter(value: unknown): JournalFrontmatter {
  if (!record(value)) throw new Error("Invalid journal frontmatter: object required");
  for (const key of Object.keys(value)) {
    if (!frontmatterKeys.has(key)) throw new Error(`Invalid journal frontmatter: unexpected ${key}`);
  }
  const slug = requiredText(value, "slug", 160);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Invalid journal frontmatter: slug");
  const title = requiredText(value, "title", 160);
  const excerpt = requiredText(value, "excerpt", 300);
  const date = calendarDate(value, "date");
  const author = requiredText(value, "author", 120);
  const reviewer = requiredText(value, "reviewer", 120);
  const lastUpdated = calendarDate(value, "lastUpdated");
  if (lastUpdated < date) throw new Error("Invalid journal frontmatter: lastUpdated precedes date");
  if (!Array.isArray(value.tags) || !value.tags.length || value.tags.length > 12) throw new Error("Invalid journal frontmatter: tags");
  const tags = value.tags.map((tag: unknown) => {
    if (typeof tag !== "string" || !tag.trim() || tag.trim().length > 40 || tag.includes("\0")) throw new Error("Invalid journal frontmatter: tags");
    return tag.trim();
  });
  if (new Set(tags.map((tag) => tag.toLowerCase())).size !== tags.length) throw new Error("Invalid journal frontmatter: tags");
  const coverImage = requiredText(value, "coverImage", 2048);
  if (!imageSource(coverImage)) throw new Error("Invalid journal frontmatter: coverImage");
  const seoTitle = requiredText(value, "seoTitle", 70);
  const seoDescription = requiredText(value, "seoDescription", 160);
  const zaloCtaText = requiredText(value, "zaloCtaText", 120);
  const zaloCtaPhone = value.zaloCtaPhone === undefined ? undefined : requiredText(value, "zaloCtaPhone", 16);
  const zaloCtaLink = value.zaloCtaLink === undefined ? undefined : requiredText(value, "zaloCtaLink", 2048);
  if (!zaloCtaPhone && !zaloCtaLink) throw new Error("Invalid journal frontmatter: zaloCtaPhone or zaloCtaLink required");
  if (zaloCtaPhone && !zaloContactUrl(zaloCtaPhone)) throw new Error("Invalid journal frontmatter: zaloCtaPhone");
  if (zaloCtaLink && !zaloLink(zaloCtaLink)) throw new Error("Invalid journal frontmatter: zaloCtaLink");
  return { slug, title, excerpt, date, author, reviewer, lastUpdated, tags, coverImage, seoTitle, seoDescription, zaloCtaText, zaloCtaPhone, zaloCtaLink };
}

export function validateJournalArticle(value: unknown): JournalArticle {
  if (!record(value) || typeof value.body !== "string" || !value.body.trim() || value.body.includes("\0")) {
    throw new Error("Invalid journal article: Markdown body required");
  }
  return { frontmatter: validateJournalFrontmatter(value.frontmatter), body: value.body };
}

/** Use in a journal page's static metadata or generateMetadata export. */
export function journalSeoMetadata(article: JournalFrontmatter): Metadata {
  return {
    title: article.seoTitle,
    description: article.seoDescription,
    authors: [{ name: article.author }],
    openGraph: {
      type: "article",
      title: article.seoTitle,
      description: article.seoDescription,
      publishedTime: article.date,
      modifiedTime: article.lastUpdated,
      authors: [article.author],
      tags: article.tags,
      images: [{ url: article.coverImage, alt: article.title }],
    },
    twitter: { card: "summary_large_image", title: article.seoTitle, description: article.seoDescription, images: [article.coverImage] },
  };
}

/** Render as an external anchor with these attributes after frontmatter validation. */
export function journalZaloCta(article: JournalFrontmatter): { text: string; href: string; target: "_blank"; rel: "noopener noreferrer" } {
  const href = article.zaloCtaLink ?? (article.zaloCtaPhone ? zaloContactUrl(article.zaloCtaPhone) : null);
  if (!href) throw new Error("Invalid journal Zalo CTA destination");
  return { text: article.zaloCtaText, href, target: "_blank", rel: "noopener noreferrer" };
}

export const collections: Collection[] = [
  { name: "Living", slug: "living", description: "Quiet forms for the room where life gathers.", image: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1600&q=85" },
  { name: "Dining", slug: "dining", description: "Tables and seating shaped around daily rituals.", image: "https://images.unsplash.com/photo-1600566753051-f0b89df2dd90?auto=format&fit=crop&w=1200&q=85" },
  { name: "Bedroom", slug: "bedroom", description: "Calm, tactile pieces for restorative spaces.", image: "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1600&q=85" },
];
