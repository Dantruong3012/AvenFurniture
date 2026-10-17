import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthUnavailableError, readAdminSessionContext, sessionErrorKind } from "./session";
import { staffRole, type StaffRole } from "./validation";

// Intentionally uncached: every operation verifies both identity and live DB
// authorization. Never use the service client to perform this check.
export async function requireAdmin(role?: StaffRole) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error && sessionErrorKind(error) === "unavailable") throw new AuthUnavailableError();
  if (error || !user) redirect("/admin/login");
  const context = await readAdminSessionContext(supabase);
  if (!context) redirect("/admin/login");
  if (role && context.role !== role) redirect("/admin/access-denied");
  const { data: profile, error: profileError } = await supabase
    .from("admin_profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (profileError) throw new AuthUnavailableError();
  if (!profile?.active || staffRole(profile.role) !== context.role || (role && profile.role !== role)) redirect("/admin/access-denied");
  return { supabase, user, profile, session: context };
}

export async function requireStaffManager() {
  const context = await requireAdmin();
  if (context.session.role !== "super_admin" && context.session.role !== "admin") redirect("/admin/access-denied");
  return context;
}
