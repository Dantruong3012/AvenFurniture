import type { Metadata } from "next";
import Link from "next/link";
import { ConsultantGrid } from "@/components/consultant/consultant-grid";
import { readPublicConsultants } from "@/lib/consultants/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Furniture consultants", description: "Meet our furniture consultants and chat directly on Zalo about your space." };

export default async function ConsultantsPage() {
  let consultants;
  try { consultants = await readPublicConsultants(); } catch { consultants = null; }
  return <>
    <header className="page-hero"><div className="container"><p className="section-note">A little guidance</p><h1>Let’s find your<br />perfect fit.</h1><p>Talk to our furniture consultants about materials, dimensions, and pieces that suit your space.</p></div></header>
    <section className="section container" aria-label="Furniture consultants">
      {consultants ? <ConsultantGrid consultants={consultants} /> : <div className="empty-state" role="status"><h2>Our directory is temporarily unavailable.</h2><p>Please try again shortly, or contact the studio for help.</p><Link className="btn btn-secondary" href="/contact">Contact the studio</Link></div>}
    </section>
  </>;
}
