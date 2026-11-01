import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CatalogClient } from "@/components/product/catalog-client";
import { ArrowIcon } from "@/components/ui/icons";
import { collectionProductHref, resolveCollectionCatalog } from "@/lib/catalog/public";
import { listPublishedCollectionProducts, parseCollectionFilters } from "@/lib/catalog/queries";
import { getI18n } from "@/lib/i18n/server";


export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("Collections"), description: t("Curated furniture collections by room, material, and point of view.") };
}


export default async function CollectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t } = await getI18n();

  const filters = parseCollectionFilters(await searchParams);
  if (!filters.collection) return <><header className="page-hero collection-hero"><div className="container"><p className="section-note">{t("Curated worlds")}</p><h1>{t("Collections with")}<br/>{t("a sense of place")}</h1></div></header><section className="section"><div className="container collection-list">{resolveCollectionCatalog().map((collection, index) => <Link href={collectionProductHref(collection)} className="collection-row" key={collection.slug}><span className="collection-number">{String(index + 1).padStart(2, "0")}</span><div className="collection-picture"><Image src={collection.image} alt={t(collection.metadata.imageAlt)} fill sizes="(max-width: 768px) 100vw, 42vw"/></div><div className="collection-copy"><h2>{t(collection.title ?? "")}</h2><p>{t(collection.description ?? "")}</p><span className="inline-link">{t("Browse products")}{" "}<ArrowIcon/></span></div></Link>)}</div></section></>;

  const collection = resolveCollectionCatalog(filters.collection)[0];
  if (!collection) return <div className="container section empty-state"><h1>{t("Collection not found")}</h1><p>{t("Choose one of our current collections.")}</p><Link className="btn btn-secondary" href="/collections">{t("Browse collections")}</Link></div>;

  const result = await listPublishedCollectionProducts(filters);
  if (!result) throw new Error("Collection could not be loaded.");
  return <><header className="page-hero collection-hero"><div className="container"><p className="section-note"><Link href="/collections">{t("Collections")}</Link> / {t(collection.name ?? "")}</p><h1>{t(collection.title ?? "")}</h1><p>{t(collection.description ?? "")}</p></div></header><CatalogClient products={result.products} count={result.count} filters={filters} categories={result.categories} collection={{ slug: collection.slug, total: result.total }}/></>;
}
