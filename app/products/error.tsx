"use client";
import { useI18n } from "@/lib/i18n/client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  const { t } = useI18n();
 return <div className="container section empty-state" role="alert"><h2>{t("Catalog is temporarily unavailable")}</h2><p>{t("Please try again.")}</p><button className="btn btn-primary" onClick={reset}>{t("Retry")}</button></div>; }
