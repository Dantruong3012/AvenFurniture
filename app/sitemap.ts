import type { MetadataRoute } from "next";
import { listPublicCategories, listSitemapProducts } from "@/lib/repositories/supabaseProductRepository";
import { siteOrigin } from "@/lib/catalog/site-url";
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteOrigin();
  const [categories, products] = await Promise.all([listPublicCategories(), listSitemapProducts()]);
  return [
    { url: base, changeFrequency: "weekly" },
    { url: `${base}/products`, changeFrequency: "daily" },
    ...categories.map((category) => ({ url: `${base}/products?category=${category.slug}`, changeFrequency: "weekly" as const })),
    ...products.map((product) => ({ url: `${base}/products/${product.slug}`, lastModified: product.updated_at, changeFrequency: "weekly" as const, images: product.product_images.filter((image) => image.is_primary && image.media_assets).map((image) => image.media_assets!.secure_url) })),
  ];
}
