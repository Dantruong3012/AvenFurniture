"use client";
import Image from "next/image";
import { useState } from "react";
import { ProductInquiryModal } from "@/components/product/product-inquiry-modal";
import Link from "next/link";
import { useStore } from "@/components/store/store-provider";
import { HeartIcon } from "@/components/ui/icons";
import { formatCatalogPrice, type CatalogProduct } from "@/lib/catalog/public";
import { useI18n } from "@/lib/i18n/client";


export function ProductCard({ product }: { product: CatalogProduct }) {
  const { t, locale } = useI18n();

  const { wishlist, toggleWishlist } = useStore();
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [inquiryStarted, setInquiryStarted] = useState(false);
  const wished = wishlist.includes(product.id);
  const image = product.images[0];
  return <article className="product-card"><div className="product-image-wrap">
    <Link href={`/products/${product.slug}`} aria-label={t("View {v0}", { v0: product.name })}>
      {image ? <Image src={image.url} alt={image.alt} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="product-image"/> : <span className="product-image-placeholder">{t("Image coming soon")}</span>}
    </Link>
    <button className="wishlist-button" onClick={() => toggleWishlist(product.id)} aria-label={wished ? t("Remove {v0} from wishlist", { v0: product.name }) : t("Add {v0} to wishlist", { v0: product.name })} aria-pressed={wished}><HeartIcon fill={wished ? "currentColor" : "none"}/></button>
  </div><div className="product-card-info"><div><h3><Link href={`/products/${product.slug}`}>{product.name}</Link></h3><p>{typeof product.attributes === "object" && product.attributes && !Array.isArray(product.attributes) && typeof product.attributes.material === "string" ? product.attributes.material : product.category.name}</p></div><div className="price"><span>{t(formatCatalogPrice(product.price, product.currency, locale === "vi" ? "vi-VN" : "en-US"))}</span></div></div><button className="text-link product-inquiry-trigger" onClick={() => { setInquiryStarted(true); setInquiryOpen(true); }} aria-label={t("Inquire about {v0}", { v0: product.name })}>{t("Inquire about this piece")}</button>{inquiryStarted && <ProductInquiryModal product={product} open={inquiryOpen} onClose={() => setInquiryOpen(false)}/>}</article>;
}
export function ProductGrid({ products }: { products: CatalogProduct[] }) { return <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product}/>)}</div>; }
