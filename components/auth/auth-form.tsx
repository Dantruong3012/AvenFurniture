"use client";
import { useActionState } from "react";
import { login, requestPasswordReset, resetPassword, changePassword, type AuthState } from "@/lib/auth/actions";
import { useI18n } from "@/lib/i18n/client";


const actions = { login, forgot: requestPasswordReset, reset: resetPassword, change: changePassword };
const labels = { login: "Sign in", forgot: "Send reset link", reset: "Set password", change: "Change password" };
export function AuthForm({ mode, tokenHash, type }: { mode: keyof typeof actions; tokenHash?: string; type?: string }) {
  const { t } = useI18n();

  const [state, action, pending] = useActionState<AuthState, FormData>(actions[mode], {});
  const newPassword = mode === "reset" || mode === "change";
  return <form action={action} className="auth-form">
    {(mode === "login" || mode === "forgot") && <label>{t("Email")}<input name="email" type="email" autoComplete="username" maxLength={254} required /></label>}
    {mode === "change" && <label>{t("Current password")}<input name="current_password" type="password" autoComplete="current-password" maxLength={128} required /></label>}
    {mode !== "forgot" && <label>{newPassword ? t("New password") : t("Password")}<input name="password" type="password" autoComplete={newPassword ? "new-password" : "current-password"} minLength={newPassword ? 12 : 1} maxLength={128} required /></label>}
    {newPassword && <label>{t("Confirm new password")}<input name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>}
    {mode === "reset" && <label>{t("Primary authenticator code (if MFA is enabled)")}<input name="mfa_code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} /></label>}
    {mode === "reset" && <><input type="hidden" name="token_hash" value={tokenHash ?? ""} /><input type="hidden" name="type" value={type ?? ""} /></>}
    {state.error && <p role="alert">{t(state.error ?? "")}</p>}
    {state.message && <p role="status">{t(state.message ?? "")}</p>}
    <button className="btn" type="submit" disabled={pending}>{pending ? t("Please wait…") : t(labels[mode])}</button>
  </form>;
}
