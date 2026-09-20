"use client";
import { ProductGrid } from "@/components/product/product-card";
import { useStore } from "@/components/store/store-provider";
import { ButtonLink } from "@/components/ui/button";
export default function WishlistPage(){const {products,wishlist}=useStore();const items=products.filter((p)=>wishlist.includes(p.id));return <section className="section container"><header className="title-row"><div><p className="section-note">Saved for later</p><h1>Wishlist</h1><p>{items.length} {items.length===1?"piece":"pieces"} in your edit</p></div></header>{items.length?<ProductGrid products={items}/>:<div className="empty-state"><h2>A place for pieces you love.</h2><p>Use the heart on any product to keep it here while you decide.</p><ButtonLink href="/products">Explore the collection</ButtonLink></div>}</section>}
