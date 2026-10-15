"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useStore } from "@/components/store/store-provider";
import { Button } from "@/components/ui/button";
import { HeartIcon, MinusIcon, PlusIcon } from "@/components/ui/icons";
import { formatCatalogPrice, type CatalogProduct } from "@/lib/catalog/public";

export function ProductDetailClient({ product, related }: { product: CatalogProduct; related: CatalogProduct[] }) {
  const { addToCart, wishlist, toggleWishlist } = useStore();
  const [activeImage, setActiveImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [notice, setNotice] = useState("");
  const image = product.images[activeImage] || product.images[0];
  const wished = wishlist.includes(product.id);
  const attributes = product.attributes && typeof product.attributes === "object" && !Array.isArray(product.attributes) ? product.attributes : {};
  return <><div className="container breadcrumb"><Link href="/products">Products</Link><span>/</span><Link href={`/products?category=${product.category.slug}`}>{product.category.name}</Link><span>/</span><span>{product.name}</span></div>
    <section className="container product-detail"><div className="gallery"><div className="gallery-main">{image ? <Image src={image.url} alt={image.alt} fill priority sizes="(max-width: 900px) 100vw, 58vw"/> : <span>Image coming soon</span>}</div><div className="gallery-thumbs">{product.images.map((item, index) => <button key={item.id} onClick={() => setActiveImage(index)} className={activeImage === index ? "active" : ""} aria-label={`Show image ${index + 1}`} aria-pressed={activeImage === index}><Image src={item.url} alt="" fill sizes="120px"/></button>)}</div></div>
      <div className="product-summary"><p className="section-note">{product.category.name}</p><h1>{product.name}</h1><div className="detail-price">{formatCatalogPrice(product.price, product.currency)}</div><p className="detail-description">{product.description}</p>
        <div className="quantity-row"><span>Quantity</span><div><button onClick={() => setQuantity(Math.max(1, quantity - 1))} aria-label="Decrease quantity"><MinusIcon/></button><output>{quantity}</output><button onClick={() => setQuantity(Math.min(999, quantity + 1))} aria-label="Increase quantity"><PlusIcon/></button></div></div>
        <div className="detail-actions"><Button onClick={() => { addToCart(product.id, quantity); setNotice(`${quantity} added to your quote list.`); }}>Add to quote list</Button><Button variant="secondary" onClick={() => toggleWishlist(product.id)} aria-pressed={wished}><HeartIcon fill={wished ? "currentColor" : "none"}/><span className="sr-only">{wished ? "Remove from" : "Add to"} wishlist</span></Button></div>{notice && <p className="success-notice" role="status">{notice}</p>}
        {Object.entries(attributes).filter(([, value]) => typeof value === "string" && value.trim()).map(([key, value]) => <details key={key}><summary>{key[0].toUpperCase() + key.slice(1)}</summary><p>{String(value)}</p></details>)}
      </div></section>{related.length > 0 && <section className="section related"><div className="container section-heading"><div><p className="section-note">Complete the room</p><h2>You may also like</h2></div></div><div className="container related-links">{related.map((item) => <Link key={item.id} href={`/products/${item.slug}`}>{item.name}</Link>)}</div></section>}</>;
}
