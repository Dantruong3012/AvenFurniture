import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { AuthUnavailableError } from "./session";

export async function readMfaState(client: SupabaseClient<Database>) {
  const factors = await client.auth.mfa.listFactors();
  const claims = await client.auth.getClaims();
  if (factors.error || claims.error || !claims.data?.claims) throw new AuthUnavailableError();
  return {
    enrolled: factors.data.all.some((factor) => factor.status === "verified"),
    aal2: claims.data.claims.aal === "aal2",
    factors: factors.data.all,
  };
}

// Require step-up for password/factor changes once the user opted into MFA.
// Mandatory super_admin enrollment is intentionally NOT enabled yet.
export async function sensitiveAuthAllowed(client: SupabaseClient<Database>) {
  const state = await readMfaState(client);
  return !state.enrolled || state.aal2;
}
