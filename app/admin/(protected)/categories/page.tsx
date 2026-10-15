import { CatalogPage } from "@/components/admin/catalog-page";
import type { SearchParams } from "@/lib/catalog/queries";
export default async function CategoriesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <CatalogPage kind="categories" params={await searchParams}/>;
}
