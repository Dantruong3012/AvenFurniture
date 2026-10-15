"use client";
import { ProductGrid } from "@/components/product/product-card";
import { useStore } from "@/components/store/store-provider";
import { ButtonLink } from "@/components/ui/button";
import { useResolvedProducts } from "@/lib/catalog/use-resolved-products";
export default function WishlistPage() {
  const { wishlist, toggleWishlist, hydrated } = useStore();
  const { products, loading, error, reload } = useResolvedProducts(wishlist, hydrated);
  const unavailable = wishlist.filter((id) => !products.some((product) => product.id === id));
  return <section className="section container"><header className="title-row"><div><p className="section-note">Saved for later</p><h1>Wishlist</h1><p>{wishlist.length} saved {wishlist.length === 1 ? "piece" : "pieces"}</p></div></header>
    {loading ? <p role="status">Loading saved products…</p> : error ? <div role="alert"><p>{error}</p><button className="btn btn-secondary" onClick={reload}>Retry</button></div> : <>{products.length > 0 && <ProductGrid products={products}/>} {unavailable.map((id) => <article key={id} className="unavailable-item"><p>This saved product is no longer available.</p><button className="text-link" onClick={() => toggleWishlist(id)}>Remove</button></article>)}{!wishlist.length && <div className="empty-state"><h2>A place for pieces you love.</h2><p>Use the heart on any product to keep it here while you decide.</p><ButtonLink href="/products">Explore the collection</ButtonLink></div>}</>}
  </section>;
}
