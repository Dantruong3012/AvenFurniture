export type JournalFrontmatter = {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  lastUpdated: string;
  author: string;
  reviewer: string;
  tags: string[];
  coverImage: string;
  seoTitle: string;
  seoDescription: string;
};

export type JournalArticle = {
  frontmatter: JournalFrontmatter;
  body: string;
  readingMinutes: number;
};
