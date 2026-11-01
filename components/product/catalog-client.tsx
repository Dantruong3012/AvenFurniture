import Link from "next/link";
import { ProductGrid } from "@/components/product/product-card";
import type { CatalogFilters, CatalogProduct } from "@/lib/catalog/public";

export function CatalogClient({ products, count, filters, categories, collection }: { products: CatalogProduct[]; count: number; filters: CatalogFilters; categories: { id: string; name: string; slug: string }[]; collection?: { slug: string; total: number } }) {
  const baseHref = collection ? `/collections?collection=${encodeURIComponent(collection.slug)}` : "/products";
  const pageHref = (page: number) => { const params = new URLSearchParams({ q: filters.q, category: filters.category, material: filters.material, price: filters.price, sort: filters.sort, page: String(page) }); if (collection) params.set("collection", collection.slug); return `${collection ? "/collections" : "/products"}?${params}`; };
  return <div className="container catalog-shell"><form action={collection ? "/collections" : "/products"} className="public-catalog-form">
    {collection && <input type="hidden" name="collection" value={collection.slug}/>}
    <label>Search products<input type="search" name="q" defaultValue={filters.q} maxLength={100} placeholder="Search by name"/></label>
    <label>Category<select name="category" defaultValue={filters.category}><option value="">All categories</option>{categories.map((category) => <option value={category.slug} key={category.id}>{category.name}</option>)}</select></label>
    <label>Material<input name="material" defaultValue={filters.material} maxLength={80} placeholder="e.g. oak"/></label>
    <label>Price<select name="price" defaultValue={filters.price}><option value="all">All prices</option><option value="quote">Request a quote</option><option value="priced">Priced products</option><option value="under-1000">USD under $1,000</option><option value="1000-3000">USD $1,000–$3,000</option><option value="over-3000">USD over $3,000</option></select></label>
    <label>Sort<select name="sort" defaultValue={filters.sort}><option value="featured">Featured</option><option value="newest">Newest</option><option value="name">Name A–Z</option><option value="price-low">Price: low to high by currency</option><option value="price-high">Price: high to low by currency</option></select></label>
    <button className="btn btn-primary">Apply</button><Link href={baseHref} className="text-link">Clear</Link>
  </form><section className="catalog-results"><p className="result-count">{count} {count === 1 ? "piece" : "pieces"}</p>{products.length ? <ProductGrid products={products}/> : <div className="empty-state"><h2>{collection?.total === 0 ? "No pieces in this collection yet" : "No pieces found"}</h2><p>{collection?.total === 0 ? "Please explore another collection or check back soon." : count > 0 ? "This page has no pieces. Return to the first page." : count === 0 && !filters.q && !filters.category && !filters.material && filters.price === "all" ? "Our catalog is being prepared. Please check back soon." : "Try another search or clear the filters."}</p><Link className="btn btn-secondary" href={collection?.total === 0 ? "/collections" : baseHref}>{collection?.total === 0 ? "Browse collections" : "Clear filters"}</Link></div>}</section>
    <nav className="catalog-pagination" aria-label="Catalog pages">{filters.page > 1 && <Link href={pageHref(filters.page - 1)}>Previous</Link>}<span>Page {filters.page} of {Math.max(1, Math.ceil(count / 24))}</span>{filters.page * 24 < count && <Link href={pageHref(filters.page + 1)}>Next</Link>}</nav>
  </div>;
}
