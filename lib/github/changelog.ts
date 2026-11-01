import type { GitHubPullRequest } from "./types";

export type ChangelogEntry = { category: string; description: string; pullRequest: number; url: string; author: string | null };
export type ChangelogOptions = { from?: string; to?: string; title?: string; includeAuthors?: boolean; includeUncategorized?: boolean; categories?: Record<string, string> };

const defaultCategories: Record<string, string> = {
  feat: "Features", fix: "Bug Fixes", perf: "Performance", docs: "Documentation", refactor: "Refactoring", test: "Tests", build: "Build", ci: "CI", chore: "Maintenance", revert: "Reverts",
};

export function parseConventionalTitle(title: string, categories: Record<string, string> = defaultCategories) {
  const match = title.trim().match(/^([a-z]+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/i);
  if (!match) return { type: "other", scope: null, breaking: false, description: title.trim(), category: "Other" };
  const type = match[1].toLowerCase();
  const scope = match[2] ?? null;
  const breaking = Boolean(match[3]) || /BREAKING CHANGE:/i.test(title);
  return { type, scope, breaking, description: match[4].trim(), category: breaking ? "Breaking Changes" : categories[type] ?? "Other" };
}

export function collectChangelogEntries(pullRequests: GitHubPullRequest[], options: ChangelogOptions = {}): ChangelogEntry[] {
  const categories = { ...defaultCategories, ...options.categories };
  return pullRequests.filter((pr) => pr.merged && (!options.from || !pr.merged_at || pr.merged_at >= options.from) && (!options.to || !pr.merged_at || pr.merged_at <= options.to))
    .map((pr) => {
      const parsed = parseConventionalTitle(pr.title, categories);
      const description = `${parsed.scope ? `**${parsed.scope}:** ` : ""}${parsed.description}${options.includeAuthors && pr.user?.login ? ` (@${pr.user.login})` : ""}`;
      return { category: parsed.category, description, pullRequest: pr.number, url: pr.html_url, author: pr.user?.login ?? null };
    })
    .filter((entry) => options.includeUncategorized !== false || entry.category !== "Other")
    .sort((a, b) => a.category.localeCompare(b.category) || a.pullRequest - b.pullRequest);
}

export function generateChangelog(pullRequests: GitHubPullRequest[], options: ChangelogOptions = {}) {
  const entries = collectChangelogEntries(pullRequests, options);
  const groups = new Map<string, ChangelogEntry[]>();
  for (const entry of entries) groups.set(entry.category, [...(groups.get(entry.category) ?? []), entry]);
  const lines = [`# ${options.title ?? "Changelog"}`, ""];
  if (options.from || options.to) lines.push(`_${options.from ? `From ${options.from}` : ""}${options.from && options.to ? " " : ""}${options.to ? `through ${options.to}` : ""}_`, "");
  for (const [category, grouped] of groups) {
    lines.push(`## ${category}`, "");
    for (const entry of grouped) lines.push(`- ${entry.description} ([#${entry.pullRequest}](${entry.url}))`);
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}
