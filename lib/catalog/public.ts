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
  return `/collections?collection=${encodeURIComponent(collection.slug)}`;
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
export type CollectionCatalogFilters = CatalogFilters & { collection: string; status: "published" };

/** An explicit list, including an empty one, replaces the legacy category association. */
export function isProductInCollection(product: Pick<CatalogProduct, "attributes"> & { category: Pick<CatalogProduct["category"], "slug"> }, slug: string): boolean {
  const attributes = product.attributes;
  if (attributes && typeof attributes === "object" && !Array.isArray(attributes) && Object.hasOwn(attributes, "collection_slugs")) {
    return Array.isArray(attributes.collection_slugs) && attributes.collection_slugs.includes(slug);
  }
  return product.category.slug === slug;
}

export function filterCollectionProducts(products: CatalogProduct[], filters: CollectionCatalogFilters): CatalogProduct[] {
  const matches = products.filter((product) => {
    if (!isProductInCollection(product, filters.collection)) return false;
    if (filters.category && product.category.slug !== filters.category) return false;
    if (filters.q && !product.name.toLocaleLowerCase().includes(filters.q.toLocaleLowerCase())) return false;
    const material = product.attributes && typeof product.attributes === "object" && !Array.isArray(product.attributes) ? product.attributes.material : null;
    if (filters.material && (typeof material !== "string" || !material.toLocaleLowerCase().includes(filters.material.toLocaleLowerCase()))) return false;
    if (filters.price === "quote") return product.price === null;
    if (filters.price === "priced") return product.price !== null;
    if (product.price === null || product.currency !== "USD") return filters.price === "all";
    if (filters.price === "under-1000") return product.price < 1000;
    if (filters.price === "1000-3000") return product.price >= 1000 && product.price <= 3000;
    if (filters.price === "over-3000") return product.price > 3000;
    return true;
  });
  const newest = (a: CatalogProduct, b: CatalogProduct) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
  return matches.sort((a, b) => {
    if (filters.sort === "name") return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    if (filters.sort === "newest") return newest(a, b);
    if (filters.sort === "price-low" || filters.sort === "price-high") {
      const currency = a.currency.localeCompare(b.currency);
      if (currency) return currency;
      if (a.price === null || b.price === null) return a.price === null ? (b.price === null ? a.id.localeCompare(b.id) : 1) : -1;
      return (filters.sort === "price-low" ? a.price - b.price : b.price - a.price) || a.id.localeCompare(b.id);
    }
    return Number(b.featured) - Number(a.featured) || newest(a, b);
  });
}
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
