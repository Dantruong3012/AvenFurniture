import "server-only";
import { requireAdmin } from "@/lib/auth/admin";
import { uuidPattern, type CatalogKind } from "@/lib/validation/catalog";
import { collectionFilterSchema } from "@/lib/validation/catalog";
import { resolveCollectionCatalog } from "@/lib/catalog/public";
import type { CatalogFilters } from "@/lib/catalog/public";
import type { CollectionFilterQuery } from "@/lib/types";
export type SearchParams = Record<string, string | string[] | undefined>;
export function parseCollectionFilters(params: SearchParams): CollectionFilterQuery {
  const one = (key: string) => typeof params[key] === "string" ? params[key] : undefined;
  return collectionFilterSchema.parse({
    collection: one("collection"), q: one("q"), material: one("material"),
    price: one("price"), sort: one("sort"), page: one("page"),
  });
}

/** Resolve the collection to the existing public category filter; unknown slugs match nothing. */
export function collectionProductFilters(filters: CollectionFilterQuery): CatalogFilters | null {
  const collection = resolveCollectionCatalog(filters.collection)[0];
  if (!filters.collection || !collection) return null;
  return { q: filters.q, category: collection.association.categorySlug, material: filters.material,
    price: filters.price, sort: filters.sort, page: filters.page };
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
