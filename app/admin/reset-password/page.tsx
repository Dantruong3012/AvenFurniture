import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";

export default async function ResetPasswordPage() {
  const { t } = await getI18n();

  return <section className="auth-shell"><h1>{t("Set your password")}</h1><p>{t("Open the link from your invitation or password reset email.")}</p>
    <Link className="text-link" href="/admin/forgot-password">{t("Request a new reset link")}</Link></section>;
}
