import type { Database } from "@/lib/supabase/database.types";
import type { CollectionDefinition } from "@/lib/types";

/** Category slugs are the only association key; no inferred name or attribute matches. */
export const collectionCatalog = [
  { name: "Living", slug: "living", title: "Living", description: "Quiet forms for the room where life gathers.", image: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1600&q=85", metadata: { imageAlt: "Living room interior", seoTitle: "Living furniture collection", seoDescription: "Explore furniture for considered living spaces." }, association: { kind: "category", categorySlug: "living" } },
  { name: "Dining", slug: "dining", title: "Dining", description: "Tables and seating shaped around daily rituals.", image: "https://images.unsplash.com/photo-1600566753051-f0b89df2dd90?auto=format&fit=crop&w=1200&q=85", metadata: { imageAlt: "Dining room interior", seoTitle: "Dining furniture collection", seoDescription: "Explore tables and seating for shared meals." }, association: { kind: "category", categorySlug: "dining" } },
  { name: "Bedroom", slug: "bedroom", title: "Bedroom", description: "Calm, tactile pieces for restorative spaces.", image: "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1600&q=85", metadata: { imageAlt: "Bedroom interior", seoTitle: "Bedroom furniture collection", seoDescription: "Explore furniture for restful bedrooms." }, association: { kind: "category", categorySlug: "bedroom" } },
] as const satisfies readonly CollectionDefinition[];

export function resolveCollectionCatalog(slug?: string): CollectionDefinition[] {
  return collectionCatalog.filter((collection) => !slug || collection.slug === slug);
}

export function collectionProductHref(collection: CollectionDefinition): string {
  return `/products?category=${encodeURIComponent(collection.association.categorySlug)}`;
}

export function collectionForProduct(product: Pick<CatalogProduct, "category">): CollectionDefinition | null {
  return collectionCatalog.find((collection) => collection.association.categorySlug === product.category.slug) ?? null;
}

export type CatalogProduct = {
  id: string; name: string; slug: string; description: string;
  category: { id: string; name: string; slug: string };
  price: number | null; currency: string;
  attributes: Database["public"]["Tables"]["products"]["Row"]["attributes"];
  featured: boolean; images: { id: string; url: string; alt: string; width: number; height: number }[];
  seo: { title: string | null; description: string | null };
  createdAt: string; updatedAt: string;
};
export type CatalogFilters = { q: string; category: string; material: string; price: string; sort: string; page: number };
export function parseCatalogFilters(params: Record<string, string | string[] | undefined>): CatalogFilters {
  const one = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const sort = one("sort");
  const price = one("price");
  return {
    q: one("q").trim().slice(0, 100),
    category: /^[a-z0-9]+(-[a-z0-9]+)*$/.test(one("category")) ? one("category") : "",
    material: one("material").trim().slice(0, 80),
    price: ["all", "quote", "priced", "under-1000", "1000-3000", "over-3000"].includes(price) ? price : "all",
    sort: ["featured", "newest", "name", "price-low", "price-high"].includes(sort) ? sort : "featured",
    page: Math.min(10000, Math.max(1, Number.parseInt(one("page"), 10) || 1)),
  };
}
export function formatCatalogPrice(price: number | null, currency: string) {
  if (price === null) return "Request a quote";
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(price); }
  catch { return `${currency} ${price.toLocaleString("en-US")}`; }
}
