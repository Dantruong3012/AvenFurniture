import Link from "next/link";
import { ConsultantForm, DeleteConsultantForm } from "@/components/admin/consultant-form";
import type { ConsultantMember, ConsultantProfile } from "@/lib/repositories/supabaseConsultantRepository";
import { getI18n } from "@/lib/i18n/server";


export async function ConsultantManagement({ profiles, members, edit, saved, deleted }: { profiles: ConsultantProfile[]; members: ConsultantMember[]; edit?: string; saved: boolean; deleted: boolean }) {
  const { t } = await getI18n();

  const selected = profiles.find((profile) => profile.user_id === edit);
  const available = members.filter((member) => !profiles.some((profile) => profile.user_id === member.user_id));
  return <>
    <header className="admin-header"><div><p className="section-note">{t("Public contacts")}</p><h1>{t("Consultants")}</h1><p>{t("Manage the team members customers can reach on Zalo.")}</p></div><Link className="btn btn-primary" href="/admin/consultants?edit=new">{t("Add consultant")}</Link></header>
    {saved && <p role="status">{t("Consultant saved.")}</p>}{deleted && <p role="status">{t("Public consultant profile removed. The team account and inquiry history were kept.")}</p>}
    {!profiles.length ? <div className="empty-state"><h2>{t("No consultant profiles yet.")}</h2><p>{t("Add a profile for an existing team member. New profiles are hidden until you enable visibility.")}</p></div> : <div className="admin-table-wrap"><table className="admin-table"><caption className="sr-only">{t("Consultant profiles")}</caption><thead><tr><th scope="col">{t("Public name")}</th><th scope="col">{t("Team member")}</th><th scope="col">{t("Zalo phone")}</th><th scope="col">{t("Order")}</th><th scope="col">{t("Visibility")}</th><th scope="col">{t("Actions")}</th></tr></thead><tbody>{profiles.map((profile) => {
      const member = members.find((member) => member.user_id === profile.user_id);
      return <tr key={profile.user_id}><th scope="row">{profile.public_name}</th><td>{member?.display_name ?? t("Unavailable member")}</td><td>{profile.zalo_phone}</td><td>{profile.sort_order}</td><td>{!member?.active ? t("Hidden (inactive account)") : profile.enabled ? t("Visible") : t("Hidden")}</td><td><Link href={`/admin/consultants?edit=${encodeURIComponent(profile.user_id)}`} aria-label={t("Edit {v0}", { v0: profile.public_name })}>{t("Edit")}</Link></td></tr>;
    })}</tbody></table></div>}
    {edit === "new" && <ConsultantForm key="new" members={available} />}
    {selected && <><ConsultantForm key={`${selected.user_id}-${selected.updated_at}`} profile={selected} members={members} /><p>{t("Removing this public contact keeps the team account, inquiry assignments, notes, and audit history.")}</p><DeleteConsultantForm key={`delete-${selected.user_id}-${selected.updated_at}`} profile={selected} /></>}
    {edit && edit !== "new" && !selected && <p role="alert">{t("Consultant profile unavailable.")}{" "}<Link href="/admin/consultants">{t("Reload the directory")}</Link>.</p>}
  </>;
}
