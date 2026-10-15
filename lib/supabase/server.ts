import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { authCookieOptions } from "./cookies";
import { getSupabaseConfig } from "./config";
import type { Database } from "./database.types";

// Read-only by default: Server Components cannot write cookies. Proxy refreshes
// sessions; every Server Action that changes auth must explicitly enable writes.
export async function createClient({ writable = false } = {}) {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabaseConfig();
  return createServerClient<Database>(url, publishableKey, {
    cookieOptions: authCookieOptions,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        if (!writable) return;
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });
}
