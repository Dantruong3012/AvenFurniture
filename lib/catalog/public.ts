import type { Database } from "@/lib/supabase/database.types";

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
