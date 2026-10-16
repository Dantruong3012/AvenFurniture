"use client";
import Image from "next/image";
import { useState, useRef } from "react";
import { QuoteRequestModal } from "@/components/cart/quote-request-modal";
import type { InquiryItemInput } from "@/lib/validation/inquiry";
import Link from "next/link";
import { useStore } from "@/components/store/store-provider";
import { ButtonLink } from "@/components/ui/button";
import { MinusIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { formatCatalogPrice } from "@/lib/catalog/public";
import { useResolvedProducts } from "@/lib/catalog/use-resolved-products";

export default function CartPage() {
  const { cart, hydrated, updateQuantity, removeFromCart, clearCart } = useStore();
  const { products, loading, error, reload } = useResolvedProducts(cart.map((item) => item.productId), hydrated);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteItems, setQuoteItems] = useState<InquiryItemInput[] | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const lines = cart.map((item) => ({ item, product: products.find((product) => product.id === item.productId) }));
  const canRequestQuote = hydrated && !loading && !error && lines.length > 0 && lines.every(({ product }) => product);
  function openQuote() {
    if (!canRequestQuote) return;
    setQuoteItems(lines.flatMap(({ item, product }) => product ? [{ productId: product.id, productName: product.name, productSlug: product.slug, quantity: item.quantity, currency: product.currency, unitPrice: product.price }] : []));
    setQuoteOpen(true);
  }
  return <section className="section container cart-page"><header className="title-row"><div><p className="section-note">Your selection</p><h1 ref={title} tabIndex={-1}>Quote list</h1></div>{cart.length > 0 && <button className="text-link danger" onClick={clearCart}>Clear list</button>}</header>
    {loading ? <p role="status">Loading your quote list…</p> : error ? <div role="alert"><p>{error}</p><button className="btn btn-secondary" onClick={reload}>Retry</button></div> : !cart.length ? <div className="empty-state"><h2>Your quote list is ready for a first piece.</h2><p>Browse our catalog and add anything you would like to discuss.</p><ButtonLink href="/products">Browse products</ButtonLink></div> : <div className="cart-layout"><div className="cart-lines">{lines.map(({ item, product }) => <article className="cart-line" key={item.productId}>
      {product?.images[0] ? <div className="cart-thumb"><Image src={product.images[0].url} alt={product.images[0].alt} fill sizes="160px"/></div> : <div className="cart-thumb product-image-placeholder">Unavailable</div>}
      <div className="cart-line-copy">{product ? <><p>{product.category.name}</p><h2><Link href={`/products/${product.slug}`}>{product.name}</Link></h2><span>{formatCatalogPrice(product.price, product.currency)}</span><div className="line-quantity"><button onClick={() => updateQuantity(product.id, item.quantity - 1)} aria-label="Decrease quantity"><MinusIcon/></button><output>{item.quantity}</output><button onClick={() => updateQuantity(product.id, item.quantity + 1)} aria-label="Increase quantity"><PlusIcon/></button></div></> : <><h2>Product unavailable</h2><p>This product has been removed or is no longer published.</p></>}</div>
      <div className="cart-line-price"><button onClick={() => removeFromCart(item.productId)} aria-label="Remove from quote list"><TrashIcon/></button></div>
    </article>)}</div><aside className="order-summary"><h2>About your quote list</h2><p>Prices shown are indicative. We will confirm availability and delivery details with your quote.</p><button className="btn btn-primary" disabled={!canRequestQuote} onClick={openQuote}>Request a quote</button>{!canRequestQuote && <small>Remove unavailable products before requesting a quote.</small>}<Link className="text-link" href="/contact?source=quote">Contact the studio</Link></aside></div>}
    {quoteItems && <QuoteRequestModal open={quoteOpen} items={quoteItems} onSuccess={clearCart} onClose={() => setQuoteOpen(false)} returnFocusRef={title}/>}
  </section>;
}
