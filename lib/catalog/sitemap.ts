import type { MetadataRoute } from "next";

const xml = (value: string) => value.replace(/[<>&"']/g, character => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character]!);

export function renderSitemap(entries: MetadataRoute.Sitemap) {
  const urls = entries.map(entry => `<url><loc>${xml(entry.url)}</loc>${entry.lastModified ? `<lastmod>${xml(new Date(entry.lastModified).toISOString())}</lastmod>` : ""}${entry.changeFrequency ? `<changefreq>${entry.changeFrequency}</changefreq>` : ""}${entry.images?.map(image => `<image:image><image:loc>${xml(image)}</image:loc></image:image>`).join("") ?? ""}</url>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls}</urlset>`;
}
