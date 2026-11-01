"use client";
import { ProductGrid } from "@/components/product/product-card";
import { useStore } from "@/components/store/store-provider";
import { ButtonLink } from "@/components/ui/button";
import { useResolvedProducts } from "@/lib/catalog/use-resolved-products";
import { useI18n } from "@/lib/i18n/client";

export default function WishlistPage() {
  const { t } = useI18n();

  const { wishlist, toggleWishlist, hydrated, wishlistSync } = useStore();
  const { products, loading, error, reload } = useResolvedProducts(wishlist, hydrated);
  const unavailable = wishlist.filter((id) => !products.some((product) => product.id === id));
  return <section className="section container"><header className="title-row"><div><p className="section-note">{t("Saved for later")}</p><h1>{t("Wishlist")}</h1><p>{wishlist.length}{" "}{t("saved")}{" "}{wishlist.length === 1 ? t("piece") : t("pieces")}</p>{wishlistSync === "syncing" && <small role="status">{t("Synchronizing your wishlist…")}</small>}{wishlistSync === "synchronized" && <small>{t("Saved to your customer account.")}</small>}{wishlistSync === "error" && <small role="alert">{t("Your account copy could not be updated. This browser still has your wishlist.")}</small>}</div></header>
    {loading ? <p role="status">{t("Loading saved products…")}</p> : error ? <div role="alert"><p>{t(error ?? "")}</p><button className="btn btn-secondary" onClick={reload}>{t("Retry")}</button></div> : <>{products.length > 0 && <ProductGrid products={products}/>} {unavailable.map((id) => <article key={id} className="unavailable-item"><p>{t("This saved product is no longer available.")}</p><button className="text-link" onClick={() => toggleWishlist(id)}>{t("Remove")}</button></article>)}{!wishlist.length && <div className="empty-state"><h2>{t("A place for pieces you love.")}</h2><p>{t("Use the heart on any product to keep it here while you decide.")}</p><ButtonLink href="/products">{t("Explore the collection")}</ButtonLink></div>}</>}
  </section>;
}
