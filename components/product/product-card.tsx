"use client";
import Image from "next/image";
import Link from "next/link";
import { useStore } from "@/components/store/store-provider";
import { HeartIcon } from "@/components/ui/icons";
import { formatCatalogPrice, type CatalogProduct } from "@/lib/catalog/public";

export function ProductCard({ product }: { product: CatalogProduct }) {
  const { wishlist, toggleWishlist } = useStore();
  const wished = wishlist.includes(product.id);
  const image = product.images[0];
  return <article className="product-card"><div className="product-image-wrap">
    <Link href={`/products/${product.slug}`} aria-label={`View ${product.name}`}>
      {image ? <Image src={image.url} alt={image.alt} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="product-image"/> : <span className="product-image-placeholder">Image coming soon</span>}
    </Link>
    <button className="wishlist-button" onClick={() => toggleWishlist(product.id)} aria-label={wished ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`} aria-pressed={wished}><HeartIcon fill={wished ? "currentColor" : "none"}/></button>
  </div><div className="product-card-info"><div><h3><Link href={`/products/${product.slug}`}>{product.name}</Link></h3><p>{typeof product.attributes === "object" && product.attributes && !Array.isArray(product.attributes) && typeof product.attributes.material === "string" ? product.attributes.material : product.category.name}</p></div><div className="price"><span>{formatCatalogPrice(product.price, product.currency)}</span></div></div></article>;
}
export function ProductGrid({ products }: { products: CatalogProduct[] }) { return <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product}/>)}</div>; }
