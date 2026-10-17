"use server";

import { createClient as createIsolatedClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { allowAuthMutation } from "./mutation";
import { readMfaState, sensitiveAuthAllowed } from "./mfa-policy";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { inviteStaffMember, requireAdmin, requireStaffManager } from "./admin";
import { revalidatePath } from "next/cache";
import { readAdminSessionContext } from "./session";
import { assignableStaffRole, parseStaffInvitation, recoveryType, staffRole, validEmail, validNewPassword, validStaffId } from "./validation";

export type AuthState = { error?: string; message?: string };
const field = (form: FormData, name: string) => String(form.get(name) ?? "");

export async function login(_state: AuthState, form: FormData): Promise<AuthState> {
  const email = field(form, "email").trim();
  const password = field(form, "password");
  if (!validEmail(email) || !password || password.length > 128) return { error: "Enter a valid email and password." };
  if (!(await allowAuthMutation("login", email))) return { error: "Unable to sign in. Check your credentials and try again later." };
  const supabase = await createClient({ writable: true });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: "Unable to sign in. Check your credentials and try again later." };
  let context;
  try { context = await readAdminSessionContext(supabase); }
  catch { return { error: "Authentication is temporarily unavailable. Please try again." }; }
  if (!context) {
    await supabase.auth.signOut({ scope: "local" });
    return { error: "Admin access is unavailable for this account. Contact your administrator." };
  }
  redirect("/admin");
}

export async function signOut() {
  if (!(await allowAuthMutation("logout", "", 100))) throw new Error("Unable to sign out. Reload and try again.");
  const supabase = await createClient({ writable: true });
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw new Error("Unable to sign out. Please try again.");
  redirect("/admin/login");
}

export async function requestPasswordReset(_state: AuthState, form: FormData): Promise<AuthState> {
  const email = field(form, "email").trim();
  if (!validEmail(email)) return { error: "Enter a valid email address." };
  if (!(await allowAuthMutation("recovery", email, 3))) return { message: "If this account can receive a reset email, a link will arrive shortly. Check your inbox before trying again." };
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) return { error: "Password recovery is not available yet. Contact your administrator." };
  const supabase = await createClient({ writable: true });
  // Deliberately identical response for unknown accounts/provider rate limits.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: new URL("/auth/confirm", siteUrl).toString(),
  });
  return { message: "If this account can receive a reset email, a link will arrive shortly. Check your inbox before trying again." };
}

export async function resetPassword(_state: AuthState, form: FormData): Promise<AuthState> {
  const password = field(form, "password");
  const tokenHash = field(form, "token_hash");
  const type = recoveryType(field(form, "type"));
  if (!validNewPassword(password, field(form, "confirmation"))) return { error: "Use 12–128 characters and make sure both passwords match." };
  if (!type || !/^[a-f0-9]{32,128}$/i.test(tokenHash)) return { error: "This link is invalid. Request a new password reset email." };
  if (!(await allowAuthMutation("reset", tokenHash, 5))) return { error: "Unable to reset password. Try again later." };
  const supabase = await createClient({ writable: true });
  // Verify proof in the same mutation, never authorize reset by a URL flag or
  // an arbitrary pre-existing session. GET/email scanners do not consume it.
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !data.user) return { error: "This link has expired or was already used. Request a new email." };
  let context;
  try { context = await readAdminSessionContext(supabase); }
  catch { return { error: "Access verification is temporarily unavailable. Please request a new email and try again later." }; }
  if (!context) {
    await supabase.auth.signOut({ scope: "local" });
    return { error: "Admin access is unavailable. Contact your administrator." };
  }
  if (!(await sensitiveAuthAllowed(supabase))) {
    const code = field(form, "mfa_code");
    const mfa = await readMfaState(supabase);
    const factor = mfa.factors.find((entry) => entry.factor_type === "totp" && entry.status === "verified");
    if (!factor || !/^[0-9]{6}$/.test(code)) {
      await supabase.auth.signOut({ scope: "local" });
      return { error: "MFA is required. Request a new reset email and enter your primary authenticator code. If you lost it, contact the project owner." };
    }
    const verified = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (verified.error || !(await sensitiveAuthAllowed(supabase))) {
      await supabase.auth.signOut({ scope: "local" });
      return { error: "Authenticator verification failed. Request a new reset email and try again." };
    }
  }
  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    await supabase.auth.signOut({ scope: "local" });
    return { error: "Unable to update the password. Request a new email and try again." };
  }
  const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
  if (signOutError) return { error: "Password updated, but session sign-out failed. Please sign out and contact your administrator." };
  redirect("/admin/login?password=updated");
}

export async function changePassword(_state: AuthState, form: FormData): Promise<AuthState> {
  const { user } = await requireAdmin();
  if (!(await allowAuthMutation("change-password", user.id, 5))) return { error: "Unable to update password. Try again later." };
  const password = field(form, "password");
  const currentPassword = field(form, "current_password");
  if (!validNewPassword(password, field(form, "confirmation"))) return { error: "Use 12–128 characters and make sure both passwords match." };
  if (!user.email || !currentPassword || currentPassword.length > 128) return { error: "Enter your current password." };
  const supabase = await createClient({ writable: true });
  if (!(await sensitiveAuthAllowed(supabase))) return { error: "Verify your authenticator on this page before changing your password." };
  // Verify the password in an isolated session so the current AAL2 cookie is
  // not replaced by a fresh AAL1 login. Always revoke that temporary session.
  const { url, publishableKey } = getSupabaseConfig();
  const proof = createIsolatedClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  try {
    const { data: signedIn, error: authError } = await proof.auth.signInWithPassword({ email: user.email, password: currentPassword });
    if (authError || signedIn.user?.id !== user.id) return { error: "Your current password could not be verified." };
  } finally { await proof.auth.signOut({ scope: "local" }); }
  await requireAdmin();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "Unable to update your password. Try again later." };
  const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
  if (signOutError) return { error: "Password updated, but session sign-out failed. Please sign out and contact your administrator." };
  redirect("/admin/login?password=updated");
}

const teamError = { error: "Account change could not be completed. Check the account and try again." };

export async function inviteStaff(form: FormData): Promise<AuthState> {
  const { user, session } = await requireAdmin();
  if (session.role !== "super_admin") return { error: "Only a super admin can invite team members." };
  const invitation = parseStaffInvitation({ email: form.get("email"), display_name: form.get("display_name"), role: form.get("role") });
  if (!invitation) return { error: "Enter a name, valid email, and allowed role." };
  if (!(await allowAuthMutation("staff-invite", user.id, 10))) return { error: "Too many invitations. Try again later." };
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) return { error: "Invitations are not configured yet." };
  let result: Awaited<ReturnType<typeof inviteStaffMember>>;
  try { result = await inviteStaffMember(invitation, new URL("/auth/confirm", siteUrl).toString()); }
  catch (error) { return { error: error instanceof Error ? error.message : teamError.error }; }
  if (result === "disabled") return { error: "This account is disabled. Enable it from account details before inviting again." };
  if (result === "already_active") return { message: "This person already has an active team account." };
  revalidatePath("/admin/team");
  return { message: result === "resent" ? "Invitation resent." : "Invitation sent." };
}

export async function inviteStaffAction(form: FormData): Promise<AuthState> {
  return inviteStaff(form);
}

async function managedTarget(id: string, managerRole: string) {
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const service = createServiceClient();
  const result = await service.from("admin_profiles").select("user_id,role,active").eq("user_id", id).maybeSingle();
  if (result.error || !result.data || !staffRole(result.data.role) ||
      (managerRole !== "super_admin" && result.data.role === "super_admin")) return null;
  return { service, target: result.data };
}

export async function changeStaffRole(form: FormData): Promise<AuthState> {
  const { user, session } = await requireStaffManager();
  const id = field(form, "user_id");
  const role = assignableStaffRole(field(form, "role"), session.role);
  if (!validStaffId(id) || !role) return { error: "Choose a valid account and role." };
  if (!(await allowAuthMutation("staff-role", user.id, 20))) return teamError;
  const managed = await managedTarget(id, session.role);
  if (!managed) return teamError;
  if (managed.target.role === role) return { message: "Role is already current." };
  const { data, error } = await managed.service.from("admin_profiles").update({ role })
    .eq("user_id", id).eq("role", managed.target.role).select("user_id").maybeSingle();
  if (error || !data) return { error: "Role change was rejected. The last active super admin must remain." };
  revalidatePath("/admin/team");
  return { message: "Role updated. Existing sessions now use the new role." };
}

export async function setStaffActive(form: FormData): Promise<AuthState> {
  const { user, session } = await requireStaffManager();
  const id = field(form, "user_id");
  const active = field(form, "active");
  if (!validStaffId(id) || (active !== "true" && active !== "false")) return teamError;
  if (!(await allowAuthMutation("staff-active", user.id, 20))) return teamError;
  const managed = await managedTarget(id, session.role);
  if (!managed) return teamError;
  const enable = active === "true";
  if (enable) {
    const currentAuth = await managed.service.auth.admin.getUserById(id);
    if (currentAuth.error || !currentAuth.data.user || currentAuth.data.user.deleted_at) return { error: "A deleted Auth account cannot be enabled. Send a new invitation instead." };
  }
  if (managed.target.active !== enable) {
    const { data, error } = await managed.service.from("admin_profiles").update({ active: enable })
      .eq("user_id", id).eq("role", managed.target.role).eq("active", !enable).select("user_id").maybeSingle();
    if (error || !data) return { error: "Account change was rejected. The last active super admin must remain." };
  }
  if (!enable) {
    const ban = await managed.service.auth.admin.updateUserById(id, { ban_duration: "876000h" });
    if (ban.error) return { error: "Access and sessions were revoked, but the Auth ban failed. Retry or contact an administrator." };
  } else {
    const unban = await managed.service.auth.admin.updateUserById(id, { ban_duration: "none" });
    if (unban.error) return { error: "Profile was enabled, but the Auth ban remains. Retry or contact an administrator." };
  }
  revalidatePath("/admin/team");
  return { message: enable ? "Account enabled. A fresh sign in is required." : "Account disabled and sessions revoked." };
}

export async function deleteStaff(form: FormData): Promise<AuthState> {
  const { user, session } = await requireStaffManager();
  const id = field(form, "user_id");
  if (!validStaffId(id) || field(form, "confirm") !== "DELETE") return { error: "Confirm deletion to continue." };
  if (!(await allowAuthMutation("staff-delete", user.id, 10))) return teamError;
  const managed = await managedTarget(id, session.role);
  if (!managed) return teamError;
  // Keep the profile for audit/FK history. Auth soft deletion removes sign-in
  // credentials while the disabled profile permanently denies Admin access.
  if (managed.target.active) {
    const locked = await managed.service.from("admin_profiles").update({ active: false })
      .eq("user_id", id).eq("role", managed.target.role).eq("active", true).select("user_id").maybeSingle();
    if (locked.error || !locked.data) return { error: "Deletion was rejected. The last active super admin must remain." };
  }
  const deleted = await managed.service.auth.admin.deleteUser(id, true);
  if (deleted.error) return { error: "Access and sessions were revoked, but Auth deletion failed. Retry or contact an administrator." };
  revalidatePath("/admin/team");
  return { message: "Auth account deleted; its disabled audit profile was retained." };
}
