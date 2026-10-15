import "server-only";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { readAdminSessionContext } from "@/lib/auth/session";
import { sameOrigin, AuthAttemptLimiter } from "@/lib/auth/mutation";

const limiter = new AuthAttemptLimiter();
export function json(data: object, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } }); }
export async function readJson(request: Request, limit: number): Promise<Record<string, unknown> | null> {
  if (Number(request.headers.get("content-length") || 0) > limit || !request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const input = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
    return input && typeof input === "object" && !Array.isArray(input) ? input : null;
  } catch { return null; }
}
export async function adminRequest(request: Request, operation: string, limit = 60) {
  if (!sameOrigin(request.headers.get("origin"), request.headers.get("host"))) return { error: json({ error: "Request denied." }, 403) };
  try {
    const supabase = await createClient({ writable: true });
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return { error: json({ error: "Sign in again." }, 401) };
    const session = await readAdminSessionContext(supabase);
    if (!session) return { error: json({ error: "Sign in again." }, 401) };
    const key = createHash("sha256").update(`${operation}:${user.id}`).digest("hex");
    if (!limiter.take(key, Date.now(), limit)) return { error: json({ error: "Too many requests. Retry later." }, 429) };
    return { supabase, user, session };
  } catch { return { error: json({ error: "Authentication is temporarily unavailable." }, 503) }; }
}
