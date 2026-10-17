import type { SupabaseClient } from "@supabase/supabase-js";
import { isAuthRetryableFetchError, isAuthSessionMissingError } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { staffRole, type StaffRole } from "./validation";

export type AdminSessionContext = { role: StaffRole; expires_at: string };
export class AuthUnavailableError extends Error {
  constructor() { super("Authentication is temporarily unavailable. Please try again."); this.name = "AuthUnavailableError"; }
}

export function sessionErrorKind(error: unknown): "invalid" | "unavailable" {
  if (isAuthRetryableFetchError(error)) return "unavailable";
  if (isAuthSessionMissingError(error)) return "invalid";
  const status = typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  if (status === 429 || (typeof status === "number" && status >= 500)) return "unavailable";
  // Unknown errors are not proof of expiry. Preserve the cookie and fail closed.
  return ["refresh_token_not_found", "refresh_token_already_used", "session_not_found", "session_expired", "bad_jwt", "invalid_jwt", "user_not_found"].includes(String(code))
    || status === 401 || status === 403 ? "invalid" : "unavailable";
}

export function parseAdminSessionContext(data: unknown): AdminSessionContext | null {
  if (data === null) return null;
  if (typeof data !== "object" || !("role" in data) || !("expires_at" in data) ||
      !staffRole(data.role) || typeof data.expires_at !== "string" || !Number.isFinite(Date.parse(data.expires_at))) {
    throw new AuthUnavailableError();
  }
  return { role: data.role as StaffRole, expires_at: data.expires_at };
}

export async function readAdminSessionContext(supabase: SupabaseClient<Database>) {
  const { data, error } = await supabase.rpc("get_admin_session_context");
  // Missing migration, DB outage, rate limit or broken RPC must never look like
  // a successful authorization or cause an irreversible local sign-out.
  if (error) throw new AuthUnavailableError();
  return parseAdminSessionContext(data);
}
