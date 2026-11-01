import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleDetail } from "@/components/journal/article-detail";
import { getJournalArticle, listJournalArticles } from "@/lib/journal/articles";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return listJournalArticles().map((article) => ({ slug: article.frontmatter.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const article = getJournalArticle((await params).slug);
  if (!article) return { title: "Article not found", robots: { index: false } };
  const { frontmatter } = article;
  const url = `/journal/${frontmatter.slug}`;
  return {
    title: frontmatter.seoTitle,
    description: frontmatter.seoDescription,
    authors: [{ name: frontmatter.author }],
    alternates: { canonical: url },
    openGraph: { type: "article", url, title: frontmatter.seoTitle, description: frontmatter.seoDescription, publishedTime: frontmatter.date, modifiedTime: frontmatter.lastUpdated, authors: [frontmatter.author], tags: frontmatter.tags, images: [{ url: frontmatter.coverImage, alt: frontmatter.title }] },
    twitter: { card: "summary_large_image", title: frontmatter.seoTitle, description: frontmatter.seoDescription, images: [frontmatter.coverImage] },
  };
}

export default async function JournalArticlePage({ params }: Props) {
  const article = getJournalArticle((await params).slug);
  if (!article) notFound();
  return <ArticleDetail article={article} />;
}
