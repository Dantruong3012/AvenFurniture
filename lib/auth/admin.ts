import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { AuthUnavailableError, readAdminSessionContext, sessionErrorKind } from "./session";
import { staffRole, type StaffInvitation, type StaffRole } from "./validation";

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

type AuthUser = { id: string; email?: string; email_confirmed_at?: string | null; deleted_at?: string | null };

async function listAuthUsers(service: ReturnType<typeof createServiceClient>): Promise<AuthUser[]> {
  const users: AuthUser[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("Auth accounts could not be checked. Try again.");
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

export async function teamInviteStatuses(ids: string[]): Promise<Record<string, { status: "pending" | "active" | "removed"; email?: string }>> {
  const wanted = new Set(ids);
  const statuses: Record<string, { status: "pending" | "active" | "removed"; email?: string }> = {};
  for (const user of await listAuthUsers(createServiceClient())) {
    if (!wanted.has(user.id)) continue;
    if (user.deleted_at) { statuses[user.id] = { status: "removed" }; continue; }
    if (user.email) statuses[user.id] = {
      status: user.email_confirmed_at ? "active" : "pending", email: user.email,
    };
  }
  return statuses;
}

export async function inviteStaffMember(invitation: StaffInvitation, redirectTo: string): Promise<"sent" | "resent" | "already_active" | "disabled"> {
  const service = createServiceClient();
  const users = await listAuthUsers(service);
  const existing = users.find((user) => user.email?.toLowerCase() === invitation.email && !user.deleted_at);
  let profile: { user_id: string; active: boolean } | null = null;
  if (existing) {
    const found = await service.from("admin_profiles").select("user_id,active").eq("user_id", existing.id).maybeSingle();
    if (found.error) throw new Error("Team profile could not be checked. Try again.");
    profile = found.data;
    if (profile && !profile.active) return "disabled";
    if (profile && existing.email_confirmed_at) return "already_active";
  }

  const invited = await service.auth.admin.inviteUserByEmail(invitation.email, {
    data: { display_name: invitation.display_name }, redirectTo,
  });
  let authUser = invited.data.user;
  if (invited.error || !authUser) {
    const duplicate = invited.error?.code === "email_exists" || invited.error?.code === "user_already_exists" ||
      /already (registered|exists)/i.test(invited.error?.message ?? "");
    if (!duplicate) throw new Error("Invitation could not be sent. Try again.");
    // A duplicate that appeared after our initial lookup might belong to an
    // unrelated concurrent signup. A fresh request must inspect that account
    // before the profile is touched.
    if (!existing) throw new Error("The Auth account changed while inviting. Try again.");
    authUser = existing as typeof authUser;
    const resent = await service.auth.resetPasswordForEmail(invitation.email, { redirectTo });
    if (resent.error) throw new Error("Invitation could not be resent. Try again.");
  }
  if (!authUser || authUser.email?.toLowerCase() !== invitation.email) throw new Error("The Auth account did not match the invitation.");
  if (existing && existing.id !== authUser.id) throw new Error("The Auth account changed while inviting. Try again.");

  if (!profile) {
    const created = await service.from("admin_profiles").insert({
      user_id: authUser.id, display_name: invitation.display_name, role: invitation.role,
      active: true, invite_email: invitation.email, invited_at: new Date().toISOString(),
    });
    if (created.error) {
      // A concurrent retry may have inserted the same profile. Re-read it and
      // only reconcile a still-pending, enabled account.
      const found = await service.from("admin_profiles").select("user_id,active").eq("user_id", authUser.id).maybeSingle();
      if (found.error || !found.data || !found.data.active) throw new Error("Invitation was sent, but access could not be provisioned. Contact an administrator.");
      if (authUser.email_confirmed_at) return "already_active";
      profile = found.data;
    }
  }
  if (profile) {
    const updated = await service.from("admin_profiles").update({
      display_name: invitation.display_name, role: invitation.role,
      invite_email: invitation.email, invited_at: new Date().toISOString(),
    })
      .eq("user_id", authUser.id).eq("active", true).select("user_id").maybeSingle();
    if (updated.error || !updated.data) throw new Error("Invitation was sent, but access could not be reconciled. Contact an administrator.");
  }
  return existing ? "resent" : "sent";
}
