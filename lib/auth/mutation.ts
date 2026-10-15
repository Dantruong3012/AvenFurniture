import "server-only";
import { headers } from "next/headers";
import { createHash } from "node:crypto";

export function sameOrigin(origin: string | null, host: string | null) {
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    return ["http:", "https:"].includes(parsed.protocol) && parsed.host === host && !parsed.username && !parsed.password;
  } catch { return false; }
}

// Local development defense in depth. Supabase also enforces Auth rate limits.
// This bounded per-process store is NOT a distributed production rate limiter.
export class AuthAttemptLimiter {
  private entries = new Map<string, { count: number; until: number }>();
  take(key: string, now = Date.now(), limit = 10, windowMs = 600_000) {
    for (const [id, entry] of this.entries) if (entry.until <= now) this.entries.delete(id);
    const entry = this.entries.get(key);
    if (!entry && this.entries.size >= 10000) return false;
    if (entry && entry.count >= limit) return false;
    this.entries.set(key, { count: (entry?.count ?? 0) + 1, until: entry?.until ?? now + windowMs });
    return true;
  }
}
const attempts = new AuthAttemptLimiter();

export async function allowAuthMutation(operation: string, identity = "", limit = 10) {
  const requestHeaders = await headers();
  // No permissive no-Origin fallback. Next's Server Action check remains on.
  if (!sameOrigin(requestHeaders.get("origin"), requestHeaders.get("host"))) return false;
  const key = createHash("sha256").update(`${operation}:${identity.toLowerCase()}`).digest("hex");
  return attempts.take(key, Date.now(), limit);
}
