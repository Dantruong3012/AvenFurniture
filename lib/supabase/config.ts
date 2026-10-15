export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("Supabase URL and publishable key must be configured.");
  }
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("Invalid Supabase URL configuration."); }
  if (parsed.origin !== "https://eofdtqnnqgxaoykcbfrv.supabase.co" || parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password || !publishableKey.startsWith("sb_publishable_")) {
    throw new Error("Supabase project or publishable key configuration is invalid.");
  }
  return { url, publishableKey };
}
