import type { ReactNode } from "react";

function safeHref(value: string): string | null {
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return value;
  if (value.startsWith("#")) return /^#[A-Za-z][\w-]*$/.test(value) ? value : null;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password && !value.includes("\\") ? value : null;
  } catch { return null; }
}

function inline(text: string): ReactNode[] {
  const result: ReactNode[] = [];
  const token = /\[([^\]\n]+)\]\(([^\s)]+)\)|`([^`\n]+)`/g;
  let start = 0;
  for (const match of text.matchAll(token)) {
    const index = match.index;
    if (index > start) result.push(text.slice(start, index));
    if (match[3]) result.push(<code key={index} className="rounded bg-stone-100 px-1 font-mono text-sm">{match[3]}</code>);
    else {
      const href = safeHref(match[2]);
      result.push(href ? <a key={index} href={href} className="underline underline-offset-4" {...(href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{match[1]}</a> : match[1]);
    }
    start = index + match[0].length;
  }
  if (start < text.length) result.push(text.slice(start));
  return result;
}

/** Render a restricted Markdown subset as React nodes. Raw HTML is always text. */
export function MarkdownRenderer({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^\s*```/.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i++;
      blocks.push(<pre key={blocks.length} className="my-8 overflow-x-auto rounded bg-stone-100 p-5 text-sm"><code>{code.join("\n")}</code></pre>);
      continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      const className = "mb-5 mt-10 font-serif text-3xl leading-tight";
      const content = inline(heading[2]);
      blocks.push(heading[1].length === 1 ? <h2 key={blocks.length} className={className}>{content}</h2> : heading[1].length === 2 ? <h2 key={blocks.length} className={className}>{content}</h2> : heading[1].length === 3 ? <h3 key={blocks.length} className="mb-4 mt-8 font-serif text-2xl">{content}</h3> : <h4 key={blocks.length} className="mb-3 mt-7 text-lg font-semibold">{content}</h4>);
      i++; continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={blocks.length} className="my-8 border-l-2 border-amber-700 pl-6 font-serif text-2xl italic">{inline(quote.join(" "))}</blockquote>);
      continue;
    }
    const list = /^(\s*)([-*+]\s+|\d+\.\s+)(.+)$/.exec(line);
    if (list) {
      const ordered = /^\d/.test(list[2]);
      const items: ReactNode[] = [];
      while (i < lines.length) {
        const item = /^(\s*)([-*+]\s+|\d+\.\s+)(.+)$/.exec(lines[i]);
        if (!item || /^\d/.test(item[2]) !== ordered || item[1].length !== list[1].length) break;
        items.push(<li key={items.length} className="mb-2">{inline(item[3])}</li>);
        i++;
      }
      blocks.push(ordered ? <ol key={blocks.length} className="my-6 list-decimal space-y-2 pl-6">{items}</ol> : <ul key={blocks.length} className="my-6 list-disc space-y-2 pl-6">{items}</ul>);
      continue;
    }
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|>\s?|\s*```|\s*[-*+]\s+|\s*\d+\.\s+)/.test(lines[i])) paragraph.push(lines[i++].trim());
    if (paragraph.length) blocks.push(<p key={blocks.length} className="mb-6 leading-8 text-stone-700">{inline(paragraph.join(" "))}</p>);
    else i++;
  }
  return <div className="journal-prose">{blocks}</div>;
}
