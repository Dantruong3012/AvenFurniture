"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useStore } from "@/components/store/store-provider";
import { HeartIcon } from "@/components/ui/icons";
import { formatPrice } from "@/lib/data/products";
import type { Product } from "@/lib/types";

export function ProductCard({ product }: { product: Product }) {
  const { wishlist, toggleWishlist } = useStore();
  const [imageSrc, setImageSrc] = useState(product.image);
  const wished = wishlist.includes(product.id);
  return <article className="product-card">
    <div className="product-image-wrap">
      <Link href={`/products/${product.slug}`} aria-label={`View ${product.name}`}><Image src={imageSrc} onError={() => setImageSrc("https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1200&q=85")} alt={product.name} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="product-image" /></Link>
      {product.badge && <span className="product-badge">{product.badge}</span>}
      <button className="wishlist-button" onClick={() => toggleWishlist(product.id)} aria-label={wished ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`} aria-pressed={wished}><HeartIcon fill={wished ? "currentColor" : "none"} /></button>
    </div>
    <div className="product-card-info"><div><h3><Link href={`/products/${product.slug}`}>{product.name}</Link></h3><p>{product.material}</p></div><div className="price"><span>{formatPrice(product.price)}</span>{product.compareAtPrice && <s>{formatPrice(product.compareAtPrice)}</s>}</div></div>
  </article>;
}

export function ProductGrid({ products }: { products: Product[] }) {
  return <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product} />)}</div>;
}
