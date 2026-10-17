import Image from "next/image";
import Link from "next/link";
import { MarkdownRenderer } from "./markdown-renderer";
import type { JournalArticle } from "@/lib/journal/types";

export function ArticleDetail({ article }: { article: JournalArticle }) {
  const { frontmatter } = article;
  return <article>
    <header className="page-hero journal-hero">
      <div className="container">
        <p className="section-note">The Aven journal · {frontmatter.tags.join(" · ")}</p>
        <h1>{frontmatter.title}</h1>
        <p>{frontmatter.excerpt}</p>
        <p className="mt-8 text-sm text-stone-300">By {frontmatter.author} · <time dateTime={frontmatter.date}>{new Date(`${frontmatter.date}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}</time> · {article.readingMinutes} min read</p>
      </div>
    </header>
    <div className="relative aspect-[16/9] max-h-[700px] min-h-[260px] bg-stone-200"><Image src={frontmatter.coverImage} alt={`Interior inspiration for ${frontmatter.title}`} fill priority sizes="100vw" className="object-cover" /></div>
    <div className="container section max-w-[800px]">
      <MarkdownRenderer source={article.body} />
      <div className="mt-16 border-t border-stone-300 pt-8 text-sm text-stone-600"><p>Reviewed by {frontmatter.reviewer} · Updated <time dateTime={frontmatter.lastUpdated}>{frontmatter.lastUpdated}</time></p></div>
      <aside className="mt-12 bg-stone-100 p-8" aria-label="Talk with a consultant">
        <h2 className="mb-4 text-3xl">Talk through your ideas</h2>
        <p className="mb-6">Choose a furniture consultant and start a Zalo conversation about your space.</p>
        <Link className="btn btn-primary" href="/consultants">Find a consultant on Zalo <span aria-hidden="true">↗</span></Link>
      </aside>
      <Link className="inline-link mt-12" href="/journal">← All journal articles</Link>
    </div>
  </article>;
}
