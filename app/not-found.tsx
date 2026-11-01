import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";

export default async function NotFound(){
  const { t } = await getI18n();
return <div className="contact-success"><p className="section-note">404</p><h1>{t("This room is still taking shape.")}</h1><p>{t("The page you’re looking for does not exist or has moved.")}</p><Link href="/" className="btn btn-primary">{t("Return home")}</Link></div>}
