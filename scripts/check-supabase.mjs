// Read-only check. Never print keys, response bodies, or authentication tokens.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error("Missing Supabase public configuration.");
try {
  const response = await fetch(new URL("/auth/v1/settings", url), {
    headers: { apikey: key }, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Supabase settings returned HTTP ${response.status}.`);
  const settings = await response.json();
  console.log(JSON.stringify({
    projectHost: new URL(url).hostname,
    apiKeyAccepted: true,
    emailAuthEnabled: settings.external?.email === true,
    publicSignupDisabled: settings.disable_signup === true,
  }, null, 2));
} catch {
  console.error("Supabase read-only connection check failed. Check network/configuration.");
  process.exitCode = 1;
}
