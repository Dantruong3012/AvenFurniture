export function siteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const url = new URL(configured);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Invalid site URL.");
  return url.origin;
}
