import type { Metadata } from "next";
import { CatalogClient } from "@/components/product/catalog-client";
import { parseCatalogFilters } from "@/lib/catalog/public";
import { listPublicCategories, listPublishedProducts } from "@/lib/repositories/supabaseProductRepository";
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Shop", description: "Explore the complete AvenFurniture collection." };
export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = parseCatalogFilters(await searchParams);
  const [result, categories] = await Promise.all([listPublishedProducts(filters), listPublicCategories()]);
  return <><header className="page-hero"><div className="container"><p className="section-note">The complete collection</p><h1>Furniture for<br/>considered living</h1><p>Designed to work together, distinct enough to stand alone.</p></div></header><CatalogClient {...result} filters={filters} categories={categories}/></>;
}
