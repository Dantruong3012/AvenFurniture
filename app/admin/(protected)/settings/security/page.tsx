import { requireAdmin } from "@/lib/auth/admin";
import { readMfaState } from "@/lib/auth/mfa-policy";
import { AuthForm } from "@/components/auth/auth-form";
import { MfaSettings } from "@/components/auth/mfa-settings";
export default async function SecurityPage() {
  const { supabase } = await requireAdmin();
  const state = await readMfaState(supabase);
  return <div className="admin-content"><header className="admin-header"><div><p className="section-note">Your account</p><h1>Account security</h1><p>Manage how you sign in to the AvenFurniture workspace.</p></div></header>
    <div className="admin-security-grid"><section className="admin-panel"><MfaSettings aal2={state.aal2} factors={state.factors.filter((factor) => factor.factor_type === "totp").map((factor) => ({ id: factor.id, status: factor.status, name: factor.friendly_name ?? "Authenticator" }))} /></section>
    <section className="admin-panel"><h2>Change password</h2><p>Verify your current password to continue. You will need to sign in again after changing it.</p><AuthForm mode="change" /></section></div></div>;
}
