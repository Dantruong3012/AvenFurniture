import { CatalogPage } from "@/components/admin/catalog-page";
import type { SearchParams } from "@/lib/catalog/queries";
export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <CatalogPage kind="products" params={await searchParams}/>;
}
