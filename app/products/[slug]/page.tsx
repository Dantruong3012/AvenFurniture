import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { ProductDetailClient } from "@/components/product/product-detail-client";
import { getPublishedProduct, getPublishedRedirect, listPublishedProducts } from "@/lib/repositories/supabaseProductRepository";
import { siteOrigin } from "@/lib/catalog/site-url";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };
const readProduct = cache((slug: string) => getPublishedProduct(slug));
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await readProduct(slug);
  if (!product) return { title: "Product not found", robots: { index: false } };
  const title = product.seo.title || product.name;
  const description = product.seo.description || product.description;
  const image = product.images[0];
  return { title, description, alternates: { canonical: `/products/${product.slug}` }, openGraph: { title, description, type: "website", url: `/products/${product.slug}`, images: image ? [{ url: image.url, width: image.width, height: image.height, alt: image.alt }] : [] } };
}
export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await readProduct(slug);
  if (!product) {
    const target = await getPublishedRedirect(slug);
    if (target) permanentRedirect(`/products/${target}`);
    notFound();
  }
  const related = (await listPublishedProducts({ category: product.category.slug })).products.filter((item) => item.id !== product.id).slice(0, 4);
  const structured = { "@context": "https://schema.org", "@type": "Product", name: product.name, description: product.description, image: product.images.map((image) => image.url), sku: product.id,
    ...(product.price === null ? {} : { offers: { "@type": "Offer", price: product.price, priceCurrency: product.currency, url: `${siteOrigin()}/products/${product.slug}` } }) };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, "\\u003c") }}/><ProductDetailClient product={product} related={related}/></>;
}
