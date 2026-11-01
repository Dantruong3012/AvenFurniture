import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { getI18n } from "@/lib/i18n/server";

export default async function ForgotPasswordPage() {
  const { t } = await getI18n();

  return <section className="auth-shell"><h1>{t("Reset your password")}</h1><AuthForm mode="forgot" />
    <Link className="text-link" href="/admin/login">{t("Back to sign in")}</Link></section>;
}
