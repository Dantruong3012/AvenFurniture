import Image from "next/image";
import type { PublicConsultant } from "@/lib/repositories/supabaseConsultantRepository";
import { consultantAvatarUrl } from "@/lib/validation/consultant";
import { ZaloContactButton } from "@/components/consultant/zalo-contact-button";

export function ConsultantCard({ consultant }: { consultant: PublicConsultant }) {
  const avatar = consultantAvatarUrl(consultant.avatar_url);
  return <article style={{ border: "1px solid var(--line)", padding: 28, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 20, overflowWrap: "anywhere" }}>
    {avatar ? <Image unoptimized src={avatar} width={96} height={96} alt={`Portrait of ${consultant.public_name}`} style={{ borderRadius: "50%", objectFit: "cover", width: 96, height: 96 }} />
      : <span aria-hidden="true" style={{ width: 96, height: 96, borderRadius: "50%", background: "var(--ivory)", display: "grid", placeItems: "center", fontSize: "2rem" }}>{consultant.public_name.trim().charAt(0).toUpperCase()}</span>}
    <h2 style={{ fontSize: "2rem" }}>{consultant.public_name}</h2>
    <p>Furniture consultant</p>
    <div style={{ marginTop: "auto" }}><ZaloContactButton phone={consultant.zalo_phone} name={consultant.public_name} /></div>
  </article>;
}
