import type { Metadata } from "next";
import Link from "next/link";
import { ConsultantGrid } from "@/components/consultant/consultant-grid";
import { readPublicConsultants } from "@/lib/consultants/queries";
import { getI18n } from "@/lib/i18n/server";


export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("Furniture consultants"), description: t("Meet our furniture consultants and chat directly on Zalo about your space.") };
}


export default async function ConsultantsPage() {
  const { t } = await getI18n();

  let consultants;
  try { consultants = await readPublicConsultants(); } catch { consultants = null; }
  return <>
    <header className="page-hero"><div className="container"><p className="section-note">{t("A little guidance")}</p><h1>{t("Let’s find your")}<br />{t("perfect fit.")}</h1><p>{t("Talk to our furniture consultants about materials, dimensions, and pieces that suit your space.")}</p></div></header>
    <section className="section container" aria-label={t("Furniture consultants")}>
      {consultants ? <ConsultantGrid consultants={consultants} /> : <div className="empty-state" role="status"><h2>{t("Our directory is temporarily unavailable.")}</h2><p>{t("Please try again shortly, or contact the studio for help.")}</p><Link className="btn btn-secondary" href="/contact">{t("Contact the studio")}</Link></div>}
    </section>
  </>;
}
