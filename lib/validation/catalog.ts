import { z } from "zod";
import type { CollectionDefinition, CollectionFilterQuery, CollectionProductAssociation } from "@/lib/types";
import { resolveCollectionCatalog } from "@/lib/catalog/public";

const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160);
const requiredCopy = (max: number) => z.string().trim().min(1).max(max).refine((value) => !value.includes("\0"));

export const collectionDefinitionSchema: z.ZodType<CollectionDefinition> = z.strictObject({
  name: requiredCopy(120),
  slug: slugSchema,
  title: requiredCopy(160),
  description: requiredCopy(500),
  image: z.string().url().refine((value) => value.startsWith("https://")),
  metadata: z.strictObject({
    imageAlt: requiredCopy(200),
    seoTitle: requiredCopy(70),
    seoDescription: requiredCopy(160),
  }),
  association: z.strictObject({ kind: z.literal("category"), categorySlug: slugSchema }),
}).refine((collection) => collection.slug === collection.association.categorySlug, {
  message: "Collection and category slugs must match.", path: ["association", "categorySlug"],
});

export const collectionTaxonomySchema = z.array(collectionDefinitionSchema).min(1).superRefine((collections, context) => {
  const slugs = new Set<string>();
  for (const [index, collection] of collections.entries()) {
    if (slugs.has(collection.slug)) context.addIssue({ code: "custom", message: "Duplicate collection slug.", path: [index, "slug"] });
    slugs.add(collection.slug);
  }
});

const singleText = (max: number) => z.string().trim().transform((value) => value.slice(0, max)).catch("");
const priceSchema = z.enum(["all", "quote", "priced", "under-1000", "1000-3000", "over-3000"]);
const sortSchema = z.enum(["featured", "newest", "name", "price-low", "price-high"]);

/** Repeated URL parameters and malformed values are rejected by the individual defaults. */
export const collectionFilterSchema: z.ZodType<CollectionFilterQuery> = z.object({
  collection: slugSchema.catch(""),
  q: singleText(100),
  material: singleText(80),
  price: priceSchema.catch("all"),
  sort: sortSchema.catch("featured"),
  page: z.string().regex(/^[1-9]\d*$/).transform((value) => Math.min(10000, Number(value))).catch(1),
});

export type CatalogKind = "categories" | "products";
export type CatalogState = { error?: string; fields?: Record<string, string>; values?: Record<string, string> };
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const collectionSlugSchema = slugSchema.refine((slug) => resolveCollectionCatalog(slug).length === 1, "Choose an existing collection.");
export const collectionSlugsSchema = z.array(collectionSlugSchema).max(20, "Choose at most 20 collections.").superRefine((slugs, context) => {
  const seen = new Set<string>();
  for (const [index, slug] of slugs.entries()) {
    if (seen.has(slug)) context.addIssue({ code: "custom", path: [index], message: "Duplicate collection association." });
    seen.add(slug);
  }
});
export const collectionProductAssociationSchema: z.ZodType<CollectionProductAssociation> = z.strictObject({
  productId: z.string().regex(uuidPattern, "Choose a valid product ID."),
  collectionSlug: collectionSlugSchema,
});
export const collectionProductAssociationsSchema = z.array(collectionProductAssociationSchema).max(1000).superRefine((associations, context) => {
  const seen = new Set<string>();
  for (const [index, association] of associations.entries()) {
    const key = `${association.productId}:${association.collectionSlug}`;
    if (seen.has(key)) context.addIssue({ code: "custom", path: [index], message: "Duplicate collection-product association." });
    seen.add(key);
  }
});
export function suggestSlug(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d")
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 160).replace(/-$/, "");
}
export function validateCatalog(kind: CatalogKind, form: FormData) {
  const values: Record<string, string> = {};
  const fields: Record<string, string> = {};
  const text = (key: string, max: number, required = false) => {
    const raw = form.get(key);
    const value = typeof raw === "string" ? raw.trim() : "";
    values[key] = value;
    if ((required && !value) || value.length > max) fields[key] = `Enter ${required ? "1" : "0"}–${max} characters.`;
    return value;
  };
  const name = text("name", kind === "categories" ? 120 : 200, true);
  const slug = text("slug", 160) || suggestSlug(name);
  values.slug = slug;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) fields.slug = "Use lowercase letters, numbers and single hyphens.";
  const description = text("description", 10000);
  const checked = (key: string) => { const value = form.get(key) === "on"; values[key] = value ? "on" : ""; return value; };
  if (kind === "categories") {
    const order = text("sort_order", 12, true);
    if (!/^-?\d+$/.test(order) || Number(order) < -2147483648 || Number(order) > 2147483647) fields.sort_order = "Enter a valid whole number.";
    return { values, fields, data: { name, slug, description, sort_order: Number(order), active: checked("active") } };
  }
  const category_id = text("category_id", 36, true);
  if (!uuidPattern.test(category_id)) fields.category_id = "Choose a category.";
  const status = text("status", 16, true);
  if (!["draft", "published", "archived"].includes(status)) fields.status = "Choose a valid status.";
  if (status === "published" && !description) fields.description = "A description is required to publish.";
  const price = text("price", 14);
  if (price && !/^\d{1,10}(\.\d{1,2})?$/.test(price)) fields.price = "Enter a nonnegative amount with at most two decimals.";
  const currency = text("currency", 3, true).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) fields.currency = "Use a three-letter currency code (USD, VND…).";
  const seo_title = text("seo_title", 200) || null;
  const seo_description = text("seo_description", 500) || null;
  let attributes: Record<string, string | number | boolean | null | string[]> = {};
  const rawAttributes = text("attributes", 10000);
  try {
    const parsed = JSON.parse(rawAttributes || "{}");
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error();
    attributes = parsed;
  } catch { fields.attributes = "Enter a valid JSON object."; }
  if (form.has("collection_associations_present")) {
    if (form.get("collection_associations_present") !== "1") fields.collection_slugs = "Invalid collection selection.";
    if (Object.hasOwn(attributes, "collection_slugs")) fields.attributes = "Edit collections using the collection choices.";
    const selected = form.getAll("collection_slugs");
    const result = collectionSlugsSchema.safeParse(selected);
    values.collection_slugs = selected.filter((item): item is string => typeof item === "string").join(",");
    if (result.success) attributes.collection_slugs = result.data;
    else fields.collection_slugs = result.error.issues[0]?.message ?? "Choose valid collections.";
  } else if (Object.hasOwn(attributes, "collection_slugs")) {
    const result = collectionSlugsSchema.safeParse(attributes.collection_slugs);
    if (!result.success) fields.attributes = "Collection associations must be unique, existing collection slugs.";
  }
  for (const key of ["material", "color", "dimensions"]) {
    if (form.has(key)) {
      const value = text(key, 300);
      if (value) attributes[key] = value;
      else delete attributes[key];
    }
  }
  return { values, fields, data: { name, slug, description, category_id, status, price: price ? Number(price) : null,
    currency, attributes, featured: checked("featured"), seo_title, seo_description } };
}
export function catalogError(code?: string) {
  switch (code) {
    case "23505": return "This slug is already used by a product, category or previous product URL. Choose another slug.";
    case "23503": case "23001": return "This record is referenced elsewhere. Move its products first, or archive the product instead of deleting it. Check selected images and category still exist.";
    case "PT409": case "40001": return "This record changed or was deleted by another user. Reload before saving again; your input is kept here.";
    case "42501": return "Your session or permissions no longer allow this action. Sign in again.";
    case "23514": case "22023": case "22P02": return "Some values are invalid. Check the fields and try again.";
    default: return "Unable to save changes. Check your connection and retry; reload first if the result is uncertain.";
  }
}
