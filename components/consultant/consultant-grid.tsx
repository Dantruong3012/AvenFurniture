import Link from "next/link";
import type { PublicConsultant } from "@/lib/repositories/supabaseConsultantRepository";
import { ConsultantCard } from "@/components/consultant/consultant-card";

export function ConsultantGrid({ consultants }: { consultants: PublicConsultant[] }) {
  if (!consultants.length) return <div className="empty-state"><h2>Our team will be here soon.</h2><p>No consultants are listed right now. Send the studio a message and we’ll help you find what you need.</p><Link className="btn btn-secondary" href="/contact">Contact the studio</Link></div>;
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 24 }}>
    {consultants.map((consultant, index) => <ConsultantCard key={`${consultant.public_name}-${index}`} consultant={consultant} />)}
  </div>;
}
