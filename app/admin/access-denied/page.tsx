import { signOut } from "@/lib/auth/actions";
import { getI18n } from "@/lib/i18n/server";

export default async function AccessDeniedPage() {
  const { t } = await getI18n();

  return <section className="auth-shell"><h1>{t("Access unavailable")}</h1><p>{t("Contact your administrator to check your account access.")}</p>
    <form action={signOut}><button className="btn">{t("Sign out")}</button></form></section>;
}
