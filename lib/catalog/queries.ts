import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/admin";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { getPublishedProductsByIds } from "@/lib/repositories/supabaseProductRepository";
import { collectionSlugsSchema, uuidPattern, type CatalogKind } from "@/lib/validation/catalog";
import { collectionFilterSchema } from "@/lib/validation/catalog";
import { filterCollectionProducts, isProductInCollection, resolveCollectionCatalog } from "@/lib/catalog/public";
import type { CollectionCatalogFilters } from "@/lib/catalog/public";
import type { CollectionWithProducts } from "@/lib/types";
import type { Tables } from "@/lib/supabase/database.types";
export type SearchParams = Record<string, string | string[] | undefined>;
export function parseCollectionFilters(params: SearchParams): CollectionCatalogFilters {
  const one = (key: string) => typeof params[key] === "string" ? params[key] : undefined;
  return collectionFilterSchema.parse({
    collection: one("collection"), q: one("q"), category: one("category"), material: one("material"),
    price: one("price"), sort: one("sort"), page: one("page"), status: one("status"),
  });
}

/** Only known collections may start a public collection query. */
export function collectionProductFilters(filters: CollectionCatalogFilters): CollectionCatalogFilters | null {
  const collection = resolveCollectionCatalog(filters.collection)[0];
  if (!filters.collection || !collection) return null;
  return filters;
}

/** Read only published products in active categories; explicit membership overrides category fallback. */
export async function listPublishedCollectionProducts(filters: CollectionCatalogFilters) {
  if (!collectionProductFilters(filters)) return null;
  const { url, publishableKey } = getSupabaseConfig();
  const client = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const ids: string[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await client.from("products")
      .select("id,attributes,categories!inner(slug,active)")
      .eq("status", "published").eq("categories.active", true).order("id").range(start, start + 999);
    if (error) throw new Error("Collection products are temporarily unavailable.");
    const rows = data ?? [];
    for (const row of rows) {
      const category = row.categories as unknown as { slug: string };
      if (isProductInCollection({ attributes: row.attributes, category }, filters.collection)) ids.push(row.id);
    }
    if (rows.length < 1000) break;
  }
  const batches: string[][] = [];
  for (let start = 0; start < ids.length; start += 100) batches.push(ids.slice(start, start + 100));
  const published = (await Promise.all(batches.map((batch) => getPublishedProductsByIds(batch)))).flat();
  const associated = published.filter((product) => isProductInCollection(product, filters.collection));
  const categories = [...new Map(associated.map((product) => [product.category.id, product.category])).values()]
    .sort((a, b) => a.name.localeCompare(b.name));
  const filtered = filterCollectionProducts(associated, filters);
  return { products: filtered.slice((filters.page - 1) * 24, filters.page * 24), count: filtered.length, total: associated.length, categories };
}

/** Explicit membership takes precedence; legacy products inherit their category collection. */
export function resolveCollectionAssociations(
  products: Tables<"products">[], categories: Pick<Tables<"categories">, "id" | "slug">[],
): CollectionWithProducts[] {
  const categorySlugs = new Map(categories.map(({ id, slug }) => [id, slug]));
  const collections = resolveCollectionCatalog().map((collection) => ({ collection, productIds: [] as string[], products: [] as Tables<"products">[] }));
  for (const product of products) {
    const attributes = product.attributes;
    const explicit = attributes && typeof attributes === "object" && !Array.isArray(attributes)
      && Object.hasOwn(attributes, "collection_slugs") ? collectionSlugsSchema.safeParse(attributes.collection_slugs) : null;
    const slugs = explicit ? explicit.success ? explicit.data : [] : [categorySlugs.get(product.category_id)].filter((slug): slug is string => !!slug);
    for (const result of collections) if (slugs.includes(result.collection.slug)) {
      result.productIds.push(product.id);
      result.products.push(product);
    }
  }
  return collections;
}

/** Admin read across all pages; callers receive IDs and the matching product records. */
export async function readCollectionAssociations(): Promise<CollectionWithProducts[]> {
  const { supabase } = await requireAdmin();
  const categories: Pick<Tables<"categories">, "id" | "slug">[] = [];
  const products: Tables<"products">[] = [];
  for (let start = 0; ; start += 1000) {
    const result = await supabase.from("categories").select("id,slug").order("id").range(start, start + 999);
    if (result.error) throw new Error("Collection categories could not be loaded.");
    categories.push(...result.data);
    if (result.data.length < 1000) break;
  }
  for (let start = 0; ; start += 1000) {
    const result = await supabase.from("products").select("*").order("id").range(start, start + 999);
    if (result.error) throw new Error("Collection products could not be loaded.");
    products.push(...result.data);
    if (result.data.length < 1000) break;
  }
  return resolveCollectionAssociations(products, categories);
}

export async function readCollectionProducts(slug: string): Promise<CollectionWithProducts | null> {
  if (!resolveCollectionCatalog(slug).length) return null;
  return (await readCollectionAssociations()).find(({ collection }) => collection.slug === slug) ?? null;
}

export function catalogFilters(params: SearchParams, kind: CatalogKind) {
  const one = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const page = Math.min(10000, Math.max(1, Number.parseInt(one("page")) || 1));
  const status = one("status");
  return { page, q: one("q").trim().slice(0, 120),
    status: (kind === "categories" ? ["active", "inactive"] : ["draft", "published", "archived"]).includes(status) ? status : "",
    category: uuidPattern.test(one("category")) ? one("category") : "",
    sort: ["name", "oldest", "updated"].includes(one("sort")) ? one("sort") : "newest",
    edit: one("edit"), saved: one("saved") === "1", deleted: one("deleted") === "1" };
}
export async function readCatalog(kind: CatalogKind, params: SearchParams) {
  const auth = await requireAdmin();
  const filters = catalogFilters(params, kind);
  let categoryQuery = auth.supabase.from("categories").select("*", { count: "exact" });
  let productQuery = auth.supabase.from("products").select("*", { count: "exact" });
  if (filters.status) {
    categoryQuery = categoryQuery.eq("active", filters.status === "active");
    productQuery = productQuery.eq("status", filters.status);
  }
  if (filters.category) productQuery = productQuery.eq("category_id", filters.category);
  let query = kind === "categories" ? categoryQuery : productQuery;
  // Escape LIKE wildcards; never interpolate user input into an .or expression.
  if (filters.q) query = query.ilike("name", `%${filters.q.replace(/[\\%_]/g, "\\$&")}%`);
  query = query.order(filters.sort === "name" ? "name" : filters.sort === "updated" ? "updated_at" : "created_at", { ascending: ["name", "oldest"].includes(filters.sort) }).order("id");
  const { data, error, count } = await query.range((filters.page - 1) * 20, filters.page * 20 - 1);
  if (error) throw new Error("Catalog could not be loaded. Please retry.");
  return { ...auth, filters, rows: data ?? [], count: count ?? 0 };
}
