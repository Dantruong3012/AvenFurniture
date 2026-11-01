export function siteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || (process.env.NODE_ENV === "production" ? "https://aven-furniture.vercel.app" : "http://localhost:3000");
  const url = new URL(configured);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Invalid site URL.");
  if (process.env.VERCEL_ENV === "production" && (url.protocol !== "https:" || /^(localhost|127\.|\[::1\])/.test(url.hostname))) throw new Error("Production site URL must be a public HTTPS origin.");
  return url.origin;
}
