import Link from "next/link";
import { ConsultantForm, DeleteConsultantForm } from "@/components/admin/consultant-form";
import type { ConsultantMember, ConsultantProfile } from "@/lib/repositories/supabaseConsultantRepository";

export function ConsultantManagement({ profiles, members, edit, saved, deleted }: { profiles: ConsultantProfile[]; members: ConsultantMember[]; edit?: string; saved: boolean; deleted: boolean }) {
  const selected = profiles.find((profile) => profile.user_id === edit);
  const available = members.filter((member) => !profiles.some((profile) => profile.user_id === member.user_id));
  return <>
    <header className="admin-header"><div><p className="section-note">Public contacts</p><h1>Consultants</h1><p>Manage the team members customers can reach on Zalo.</p></div><Link className="btn btn-primary" href="/admin/consultants?edit=new">Add consultant</Link></header>
    {saved && <p role="status">Consultant saved.</p>}{deleted && <p role="status">Public consultant profile removed. The team account and inquiry history were kept.</p>}
    {!profiles.length ? <div className="empty-state"><h2>No consultant profiles yet.</h2><p>Add a profile for an existing team member. New profiles are hidden until you enable visibility.</p></div> : <div className="admin-table-wrap"><table className="admin-table"><caption className="sr-only">Consultant profiles</caption><thead><tr><th scope="col">Public name</th><th scope="col">Team member</th><th scope="col">Zalo phone</th><th scope="col">Order</th><th scope="col">Visibility</th><th scope="col">Actions</th></tr></thead><tbody>{profiles.map((profile) => {
      const member = members.find((member) => member.user_id === profile.user_id);
      return <tr key={profile.user_id}><th scope="row">{profile.public_name}</th><td>{member?.display_name ?? "Unavailable member"}</td><td>{profile.zalo_phone}</td><td>{profile.sort_order}</td><td>{!member?.active ? "Hidden (inactive account)" : profile.enabled ? "Visible" : "Hidden"}</td><td><Link href={`/admin/consultants?edit=${encodeURIComponent(profile.user_id)}`} aria-label={`Edit ${profile.public_name}`}>Edit</Link></td></tr>;
    })}</tbody></table></div>}
    {edit === "new" && <ConsultantForm key="new" members={available} />}
    {selected && <><ConsultantForm key={`${selected.user_id}-${selected.updated_at}`} profile={selected} members={members} /><p>Removing this public contact keeps the team account, inquiry assignments, notes, and audit history.</p><DeleteConsultantForm key={`delete-${selected.user_id}-${selected.updated_at}`} profile={selected} /></>}
    {edit && edit !== "new" && !selected && <p role="alert">Consultant profile unavailable. <Link href="/admin/consultants">Reload the directory</Link>.</p>}
  </>;
}
