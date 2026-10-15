import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/database.types";
import type { CatalogFilters, CatalogProduct } from "@/lib/catalog/public";

const selection = "id,name,slug,description,price,currency,attributes,featured,seo_title,seo_description,created_at,updated_at,categories!inner(id,name,slug,active),product_images(id,sort_order,is_primary,media_assets(id,secure_url,alt,width,height))";
function publicClient() {
  const { url, publishableKey } = getSupabaseConfig();
  return createClient<Database>(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
type ProductResult = {
  id: string; name: string; slug: string; description: string; price: number | null; currency: string; attributes: CatalogProduct["attributes"];
  featured: boolean; seo_title: string | null; seo_description: string | null; created_at: string; updated_at: string;
  categories: { id: string; name: string; slug: string; active: boolean };
  product_images: { id: string; sort_order: number; is_primary: boolean; media_assets: { id: string; secure_url: string; alt: string; width: number; height: number } | null }[];
};
function mapProduct(row: ProductResult): CatalogProduct {
  return { id: row.id, name: row.name, slug: row.slug, description: row.description,
    category: { id: row.categories.id, name: row.categories.name, slug: row.categories.slug }, price: row.price, currency: row.currency,
    attributes: row.attributes, featured: row.featured,
    images: row.product_images.filter((link) => link.media_assets).sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order).map((link) => ({ id: link.media_assets!.id, url: link.media_assets!.secure_url, alt: link.media_assets!.alt, width: link.media_assets!.width, height: link.media_assets!.height })),
    seo: { title: row.seo_title, description: row.seo_description }, createdAt: row.created_at, updatedAt: row.updated_at };
}
export async function listPublicCategories() {
  const { data, error } = await publicClient().from("categories").select("id,name,slug").eq("active", true).order("sort_order").order("name");
  if (error) throw new Error("Categories are temporarily unavailable.");
  return data || [];
}
export async function listPublishedProducts(filters: Partial<CatalogFilters> = {}): Promise<{ products: CatalogProduct[]; count: number }> {
  const page = filters.page ?? 1;
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new Error("Invalid page.");
  let query = publicClient().from("products").select(selection, { count: "exact" }).eq("status", "published").eq("categories.active", true);
  if (filters.q) query = query.ilike("name", `%${filters.q.replace(/[\\%_]/g, "\\$&")}%`);
  if (filters.category) query = query.eq("categories.slug", filters.category);
  if (filters.material) query = query.ilike("attributes->>material", `%${filters.material.replace(/[\\%_]/g, "\\$&")}%`);
  if (filters.price === "quote") query = query.is("price", null);
  if (filters.price === "priced") query = query.not("price", "is", null);
  if (filters.price === "under-1000") query = query.eq("currency", "USD").lt("price", 1000);
  if (filters.price === "1000-3000") query = query.eq("currency", "USD").gte("price", 1000).lte("price", 3000);
  if (filters.price === "over-3000") query = query.eq("currency", "USD").gt("price", 3000);
  if (filters.sort === "name") query = query.order("name").order("id");
  else if (filters.sort === "price-low") query = query.order("currency").order("price", { ascending: true, nullsFirst: false }).order("id");
  else if (filters.sort === "price-high") query = query.order("currency").order("price", { ascending: false, nullsFirst: false }).order("id");
  else if (filters.sort === "newest") query = query.order("created_at", { ascending: false }).order("id");
  else query = query.order("featured", { ascending: false }).order("created_at", { ascending: false }).order("id");
  const { data, count, error } = await query.range((page - 1) * 24, page * 24 - 1);
  if (error) throw new Error("Catalog is temporarily unavailable.");
  return { products: (data || []).map((row) => mapProduct(row as unknown as ProductResult)), count: count || 0 };
}
export async function getPublishedProduct(slug: string): Promise<CatalogProduct | null> {
  const { data, error } = await publicClient().from("products").select(selection).eq("slug", slug).eq("status", "published").eq("categories.active", true).maybeSingle();
  if (error) throw new Error("Product is temporarily unavailable.");
  return data ? mapProduct(data as unknown as ProductResult) : null;
}
export async function getPublishedProductsByIds(ids: string[]): Promise<CatalogProduct[]> {
  if (!ids.length) return [];
  const { data, error } = await publicClient().from("products").select(selection).in("id", ids.slice(0, 100)).eq("status", "published").eq("categories.active", true);
  if (error) throw new Error("Saved products are temporarily unavailable.");
  return (data || []).map((row) => mapProduct(row as unknown as ProductResult));
}
export async function getPublishedRedirect(slug: string) {
  const { data, error } = await publicClient().from("slug_redirects").select("products!inner(slug,status,categories!inner(active))").eq("old_slug", slug).eq("products.status", "published").eq("products.categories.active", true).maybeSingle();
  if (error) throw new Error("Product URL is temporarily unavailable.");
  return data?.products?.slug || null;
}
export async function listSitemapProducts() {
  const client = publicClient();
  const result: { slug: string; updated_at: string; product_images: { is_primary: boolean; media_assets: { secure_url: string } | null }[] }[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await client.from("products").select("slug,updated_at,categories!inner(active),product_images(is_primary,media_assets(secure_url))").eq("status", "published").eq("categories.active", true).order("id").range(start, start + 999);
    if (error) throw new Error("Sitemap is temporarily unavailable.");
    result.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return result;
}
