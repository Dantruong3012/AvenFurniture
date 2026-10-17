import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";
import type { Database, Tables } from "@/lib/supabase/database.types";
import { consultantAvatarUrl } from "@/lib/validation/consultant";

export type PublicConsultant = Pick<Tables<"consultant_profiles">, "public_name" | "avatar_url" | "zalo_phone" | "sort_order">;
export type ConsultantProfile = Tables<"consultant_profiles">;
export type ConsultantMember = Pick<Tables<"admin_profiles">, "user_id" | "display_name" | "active">;

export async function listPublicConsultants(): Promise<PublicConsultant[]> {
  const { url, publishableKey } = getSupabaseConfig();
  const client = createClient<Database>(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  // This RPC filters enabled profiles AND active accounts, exposing no account IDs.
  const { data, error } = await client.rpc("list_public_consultants");
  if (error) throw new Error("Consultants are temporarily unavailable.");
  return (data ?? []).map((row) => ({ public_name: row.public_name, avatar_url: consultantAvatarUrl(row.avatar_url), zalo_phone: row.zalo_phone, sort_order: row.sort_order }));
}

// Pass only the session client from requireAdmin(); no service-role access.
export async function listAdminConsultants(client: SupabaseClient<Database>) {
  const profiles: ConsultantProfile[] = [];
  const members: ConsultantMember[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await client.from("consultant_profiles").select("*").order("sort_order").order("public_name").order("user_id").range(start, start + 999);
    if (error) throw new Error("Consultant profiles could not be loaded. Please retry.");
    profiles.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  for (let start = 0; ; start += 1000) {
    const { data, error } = await client.from("admin_profiles").select("user_id,display_name,active").order("display_name").order("user_id").range(start, start + 999);
    if (error) throw new Error("Team members could not be loaded. Please retry.");
    members.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return { profiles, members };
}
