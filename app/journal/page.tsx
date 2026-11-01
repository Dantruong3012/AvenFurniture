import type { Metadata } from "next";
import { ArticleCard } from "@/components/journal/article-card";
import { listJournalArticles } from "@/lib/journal/articles";
import { getI18n } from "@/lib/i18n/server";


export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
  title: t("Journal"),
  description: t("Notes on rooms, materials, and considered living from AvenFurniture."),
  alternates: { canonical: "/journal" },
  openGraph: { type: "website", url: "/journal", title: t("The Aven journal"), description: t("Notes on rooms, materials, and considered living from AvenFurniture."), images: [{ url: "/brand/aven-furniture-logo.jpg", alt: "AvenFurniture" }] },
  twitter: { card: "summary_large_image", title: t("The Aven journal"), description: t("Notes on rooms, materials, and considered living from AvenFurniture."), images: ["/brand/aven-furniture-logo.jpg"] },
};
}


export default async function JournalPage() {
  const { t } = await getI18n();

  const articles = listJournalArticles();
  return <>
    <header className="page-hero journal-hero"><div className="container"><p className="section-note">{t("The Aven journal")}</p><h1>{t("Rooms, materials,")}<br />{t("and ways of living")}</h1><p>{t("Notes on the details that turn a space into a home.")}</p></div></header>
    <section className="section journal-grid container" aria-label={t("Published articles")}>
      {articles.map((article, index) => <ArticleCard key={article.frontmatter.slug} article={article} featured={index === 0} />)}
    </section>
  </>;
}
