
import { getI18n } from "@/lib/i18n/server";
export default async function Loading(){
  const { t } = await getI18n();
return <div className="page-loading" aria-label={t("Loading")}><div/><span>{t("Loading AvenFurniture")}</span></div>}
