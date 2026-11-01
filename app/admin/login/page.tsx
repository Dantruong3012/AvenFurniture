import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { getI18n } from "@/lib/i18n/server";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ password?: string }> }) {
  const { t } = await getI18n();

  const params = await searchParams;
  return <div className="admin-auth-page"><div className="admin-auth-brand">AvenFurniture <span>{t("Management workspace")}</span></div><section className="auth-shell"><p className="section-note">{t("Team access")}</p><h1>{t("Welcome back.")}</h1><p>{t("Sign in to manage the AvenFurniture catalog.")}</p>
    {params.password === "updated" && <p role="status">{t("Your password has been updated. Sign in again.")}</p>}
    <AuthForm mode="login" /><Link className="text-link" href="/admin/forgot-password">{t("Forgot password?")}</Link>
    <p className="auth-invite-note">{t("Access is by invitation only.")}</p></section><Link className="admin-auth-back" href="/">{t("← Back to storefront")}</Link></div>;
}
