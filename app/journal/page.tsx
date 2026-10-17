import type { Metadata } from "next";
import { ArticleCard } from "@/components/journal/article-card";
import { listJournalArticles } from "@/lib/journal/articles";

export const metadata: Metadata = {
  title: "Journal",
  description: "Notes on rooms, materials, and considered living from AvenFurniture.",
  alternates: { canonical: "/journal" },
  openGraph: { type: "website", url: "/journal", title: "The Aven journal", description: "Notes on rooms, materials, and considered living from AvenFurniture.", images: [{ url: "/brand/aven-furniture-logo.jpg", alt: "AvenFurniture" }] },
  twitter: { card: "summary_large_image", title: "The Aven journal", description: "Notes on rooms, materials, and considered living from AvenFurniture.", images: ["/brand/aven-furniture-logo.jpg"] },
};

export default function JournalPage() {
  const articles = listJournalArticles();
  return <>
    <header className="page-hero journal-hero"><div className="container"><p className="section-note">The Aven journal</p><h1>Rooms, materials,<br />and ways of living</h1><p>Notes on the details that turn a space into a home.</p></div></header>
    <section className="section journal-grid container" aria-label="Published articles">
      {articles.map((article, index) => <ArticleCard key={article.frontmatter.slug} article={article} featured={index === 0} />)}
    </section>
  </>;
}
