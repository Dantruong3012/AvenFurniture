export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    const missing = [
      !url && "NEXT_PUBLIC_SUPABASE_URL",
      !publishableKey && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ].filter(Boolean);
    // Report names only: never include environment values in logs or errors.
    throw new Error(`Missing Supabase configuration: ${missing.join(", ")}. Set these variables in the deployment's build environment and rebuild.`);
  }
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("Invalid Supabase URL configuration."); }
  if (parsed.origin !== "https://eofdtqnnqgxaoykcbfrv.supabase.co" || parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password || !publishableKey.startsWith("sb_publishable_")) {
    throw new Error("Supabase project or publishable key configuration is invalid.");
  }
  return { url, publishableKey };
}
