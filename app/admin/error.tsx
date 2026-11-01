"use client";
import { useI18n } from "@/lib/i18n/client";

export default function AdminError({ reset }: { reset: () => void }) {
  const { t } = useI18n();

  return <section className="auth-shell"><h1>{t("Temporarily unavailable")}</h1>
    <p>{t("We could not verify your access. Please try again shortly.")}</p>
    <button className="btn" onClick={reset}>{t("Try again")}</button></section>;
}
