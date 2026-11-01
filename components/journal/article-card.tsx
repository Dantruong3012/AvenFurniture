import Image from "next/image";
import Link from "next/link";
import type { JournalArticle } from "@/lib/journal/types";
import { getI18n } from "@/lib/i18n/server";


export async function ArticleCard({ article, featured = false }: { article: JournalArticle; featured?: boolean }) {
  const { t, locale } = await getI18n();

  const { frontmatter } = article;
  return <article className={featured ? "story-feature" : "story-card"}>
    <Link className="story-image block" href={`/journal/${frontmatter.slug}`} aria-label={t("Read {v0}", { v0: frontmatter.title })}>
      <Image src={frontmatter.coverImage} alt={t("Interior inspiration for {v0}", { v0: frontmatter.title })} fill sizes={featured ? "(max-width: 767px) 100vw, 65vw" : "(max-width: 767px) 100vw, 50vw"} />
    </Link>
    <div>
      <p className="section-note">{frontmatter.tags.join(" · ")}</p>
      <h2><Link href={`/journal/${frontmatter.slug}`}>{frontmatter.title}</Link></h2>
      <p>{frontmatter.excerpt}</p>
      <p><time dateTime={frontmatter.date}>{new Date(`${frontmatter.date}T00:00:00Z`).toLocaleDateString(locale === "vi" ? "vi-VN" : "en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}</time> · {article.readingMinutes}{" "}{t("min read")}</p>
      <Link className="text-link" href={`/journal/${frontmatter.slug}`}>{t("Read article")}{" "}<span aria-hidden="true">↗</span></Link>
    </div>
  </article>;
}
