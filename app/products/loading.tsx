
import { getI18n } from "@/lib/i18n/server";
export default async function Loading() {
  const { t } = await getI18n();
 return <div className="container section" role="status">{t("Loading catalog…")}</div>; }
