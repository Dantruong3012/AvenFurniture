import type { JournalArticle, JournalFrontmatter } from "./types";

// Article copy lives here until content/journal is added to this task's file ownership.
// Only entries in this registry are published; there is no runtime database dependency.
const publishedMarkdown = [
  `---
slug: a-quieter-kind-of-luxury
title: A quieter kind of luxury
excerpt: Small choices in light, texture, and proportion can make a room feel more at ease.
date: 2026-10-01
lastUpdated: 2026-10-01
author: AvenFurniture editorial team
reviewer: AvenFurniture editorial team
tags: ["Homes", "Ideas"]
coverImage: https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1400&q=85
seoTitle: A quieter kind of luxury
seoDescription: Explore simple ways to make a living room feel calm through light, texture, and proportion.
---
## Begin with the light

Notice where daylight reaches the room and where it softens. A reading chair beside a window can give that corner a purpose without filling every empty space.

## Let materials speak

Wood, linen, and stone each have a different surface. Placing a few textures together can bring warmth to a restrained palette.

> A room can feel complete while still leaving space to breathe.

Try one change at a time:

- Move a chair toward the light.
- Leave a clear path through the room.
- Keep the objects you use close at hand.

For more ideas, [explore our collections](/collections).`,
  `---
slug: living-with-natural-wood
title: Living with natural wood
excerpt: A practical note on choosing wood tones and making room for their natural variation.
date: 2026-09-18
lastUpdated: 2026-09-18
author: AvenFurniture editorial team
reviewer: AvenFurniture editorial team
tags: ["Materials", "Craft"]
coverImage: https://images.unsplash.com/photo-1615873968403-89e068629265?auto=format&fit=crop&w=1400&q=85
seoTitle: Living with natural wood
seoDescription: Consider grain, tone, and placement when bringing natural wood into an everyday room.
---
## Look closely at the grain

Two pieces of wood may share a name and still look different. Grain and tone vary from board to board, so view a material sample in the light of your own room when you can.

## Find a comfortable balance

You do not need every piece to match. A table can sit comfortably beside a different timber tone when the shapes and surrounding colours have room to relate.

1. Begin with the largest wood surface in the room.
2. Compare smaller pieces beside it in daylight.
3. Ask about the finish and care before choosing.

If you are comparing finishes, [speak with a consultant](/consultants).`,
] as const;

const requiredFields = ["slug", "title", "excerpt", "date", "lastUpdated", "author", "reviewer", "coverImage", "seoTitle", "seoDescription"] as const;
const allowedFields = new Set<string>([...requiredFields, "tags"]);

function calendarDate(value: string, field: string): string {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid journal ${field}`);
  }
  return value;
}

/** Parse the deliberately small, text-only frontmatter format used by this registry. */
export function parseJournalMarkdown(source: string): JournalArticle {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(source);
  if (!match || !match[2].trim()) throw new Error("Journal frontmatter and Markdown body required");
  const raw: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(line);
    if (!field || !allowedFields.has(field[1]) || Object.hasOwn(raw, field[1])) throw new Error(`Invalid journal frontmatter line: ${line}`);
    raw[field[1]] = field[2].trim();
  }
  for (const field of requiredFields) if (!raw[field]) throw new Error(`Missing journal ${field}`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw.slug)) throw new Error("Invalid journal slug");
  const date = calendarDate(raw.date, "date");
  const lastUpdated = calendarDate(raw.lastUpdated, "lastUpdated");
  if (lastUpdated < date) throw new Error("Journal lastUpdated precedes date");
  let tags: unknown;
  try { tags = JSON.parse(raw.tags ?? ""); } catch { throw new Error("Invalid journal tags"); }
  if (!Array.isArray(tags) || !tags.length || tags.some((tag) => typeof tag !== "string" || !tag.trim()) || new Set(tags).size !== tags.length) throw new Error("Invalid journal tags");
  if (!/^https:\/\/images\.unsplash\.com\/[^\s]+$/.test(raw.coverImage)) throw new Error("Invalid journal coverImage");
  const frontmatter: JournalFrontmatter = { ...raw, date, lastUpdated, tags } as JournalFrontmatter;
  const body = match[2].trim();
  const words = body.replace(/[`*_#>\[\]()]|https?:\/\/\S+/g, " ").match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
  return { frontmatter, body, readingMinutes: Math.max(1, Math.ceil(words / 200)) };
}

const articles = publishedMarkdown.map(parseJournalMarkdown).sort((a, b) => b.frontmatter.date.localeCompare(a.frontmatter.date));
if (new Set(articles.map((article) => article.frontmatter.slug)).size !== articles.length) throw new Error("Duplicate journal slug");

export function listJournalArticles(): JournalArticle[] { return [...articles]; }

export function getJournalArticle(slug: string): JournalArticle | undefined {
  return articles.find((article) => article.frontmatter.slug === slug);
}
