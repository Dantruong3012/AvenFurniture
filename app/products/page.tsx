import type { Metadata } from "next";
import { CatalogClient } from "@/components/product/catalog-client";
import { parseCatalogFilters } from "@/lib/catalog/public";
import { listPublicCategories, listPublishedProducts } from "@/lib/repositories/supabaseProductRepository";
import { getI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("Shop"), description: t("Explore the complete AvenFurniture collection.") };
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t } = await getI18n();

  const filters = parseCatalogFilters(await searchParams);
  const [result, categories] = await Promise.all([listPublishedProducts(filters), listPublicCategories()]);
  return <><header className="page-hero"><div className="container"><p className="section-note">{t("The complete collection")}</p><h1>{t("Furniture for")}<br/>{t("considered living")}</h1><p>{t("Designed to work together, distinct enough to stand alone.")}</p></div></header><CatalogClient {...result} filters={filters} categories={categories}/></>;
}
