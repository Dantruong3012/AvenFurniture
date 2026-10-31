import type { MetadataRoute } from "next";
import { listPublicCategories, listSitemapProducts } from "@/lib/repositories/supabaseProductRepository";
import { siteOrigin } from "@/lib/catalog/site-url";
import { renderSitemap } from "@/lib/catalog/sitemap";
import { listJournalArticles } from "@/lib/journal/articles";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const base = siteOrigin();
    const [categories, products] = await Promise.all([listPublicCategories(), listSitemapProducts()]);
    const entries: MetadataRoute.Sitemap = [
      { url: base, changeFrequency: "weekly" },
      { url: `${base}/products`, changeFrequency: "daily" },
      { url: `${base}/journal`, changeFrequency: "weekly" },
      ...listJournalArticles().map(({ frontmatter }) => ({ url: `${base}/journal/${frontmatter.slug}`, lastModified: frontmatter.lastUpdated, changeFrequency: "monthly" as const, images: [frontmatter.coverImage] })),
      ...categories.map(category => ({ url: `${base}/products?category=${encodeURIComponent(category.slug)}`, changeFrequency: "weekly" as const })),
      ...products.map(product => ({ url: `${base}/products/${encodeURIComponent(product.slug)}`, lastModified: product.updated_at, changeFrequency: "weekly" as const, images: product.product_images.filter(image => image.is_primary && image.media_assets).map(image => image.media_assets!.secure_url) })),
    ];
    return new Response(renderSitemap(entries), { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=300" } });
  } catch {
    // A failed catalog read is not an empty catalog. Ask crawlers to retry
    // rather than publishing a successful sitemap that drops real products.
    return new Response("Sitemap temporarily unavailable. Please retry later.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "60" } });
  }
}
