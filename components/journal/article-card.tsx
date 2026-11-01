import Image from "next/image";
import Link from "next/link";
import type { JournalArticle } from "@/lib/journal/types";

export function ArticleCard({ article, featured = false }: { article: JournalArticle; featured?: boolean }) {
  const { frontmatter } = article;
  return <article className={featured ? "story-feature" : "story-card"}>
    <Link className="story-image block" href={`/journal/${frontmatter.slug}`} aria-label={`Read ${frontmatter.title}`}>
      <Image src={frontmatter.coverImage} alt={`Interior inspiration for ${frontmatter.title}`} fill sizes={featured ? "(max-width: 767px) 100vw, 65vw" : "(max-width: 767px) 100vw, 50vw"} />
    </Link>
    <div>
      <p className="section-note">{frontmatter.tags.join(" · ")}</p>
      <h2><Link href={`/journal/${frontmatter.slug}`}>{frontmatter.title}</Link></h2>
      <p>{frontmatter.excerpt}</p>
      <p><time dateTime={frontmatter.date}>{new Date(`${frontmatter.date}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}</time> · {article.readingMinutes} min read</p>
      <Link className="text-link" href={`/journal/${frontmatter.slug}`}>Read article <span aria-hidden="true">↗</span></Link>
    </div>
  </article>;
}
