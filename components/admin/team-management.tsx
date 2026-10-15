"use client";

import { useMemo, useRef, useState } from "react";

export type TeamMember = {
  user_id: string;
  display_name: string;
  role: string;
  active: boolean;
  created_at: string;
};

export function TeamManagement({ members }: { members: TeamMember[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const editorRef = useRef<HTMLElement>(null);
  const showDetails = (id: string) => {
    setSelected(id);
    if (window.matchMedia("(max-width: 850px)").matches) requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const active = members.filter((member) => member.active).length;
  const visible = useMemo(() => members.filter((member) => {
    const matchesStatus = filter === "all" || (filter === "active" ? member.active : !member.active);
    return matchesStatus && member.display_name.toLowerCase().includes(search.trim().toLowerCase());
  }), [members, search, filter]);
  const editing = members.find((member) => member.user_id === selected);
  const creating = selected === "new";

  return <div className="admin-content team-page">
    <header className="admin-header"><div><p className="section-note">Workspace settings</p><h1>Team & access</h1><p>Review team accounts and plan who can manage your catalog. Account changes are not available yet.</p></div><button className="btn btn-primary" type="button" onClick={() => showDetails("new")} aria-controls="team-account-details">Add team member</button></header>
    <div className="team-summary" aria-label="Team summary"><div><strong>{members.length}</strong><span>Total accounts</span></div><div><strong>{active}</strong><span>Active accounts</span></div><div><strong>{members.length - active}</strong><span>Disabled accounts</span></div></div>
    <div className="team-layout"><section className="admin-panel team-list"><div className="admin-panel-heading"><div><p className="section-note">People</p><h2>Team members</h2></div></div>
      <div className="team-toolbar"><label><span className="sr-only">Search team members</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name" /></label><label><span className="sr-only">Filter account status</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All accounts</option><option value="active">Active</option><option value="disabled">Disabled</option></select></label></div>
      <div className="team-rows">{visible.map((member) => <button type="button" key={member.user_id} className={`team-row${selected === member.user_id ? " selected" : ""}`} onClick={() => showDetails(member.user_id)} aria-pressed={selected === member.user_id} aria-controls="team-account-details">
        <span className="team-row-person"><span className="team-avatar" aria-hidden="true">{member.display_name.trim().charAt(0).toUpperCase() || "A"}</span><span><strong>{member.display_name}</strong><small>Added {new Date(member.created_at).toLocaleDateString("en-US")}</small></span></span><span className="team-row-meta"><span>{member.role === "super_admin" ? "Super admin" : "Staff"}</span><span className={`team-state${member.active ? " active" : ""}`}>{member.active ? "Active" : "Disabled"}</span></span>
      </button>)}</div>
      {!visible.length && <div className="admin-empty"><h3>{members.length ? "No matching accounts" : "No team accounts found"}</h3><p>{members.length ? "Try another name or status filter." : "Team accounts will appear here when available."}</p></div>}
    </section><aside ref={editorRef} id="team-account-details" className="admin-panel team-editor" aria-label="Account details">
      <div className="team-editor-top"><p className="section-note">{creating ? "New account" : editing ? "Account details" : "Manage access"}</p>{selected && <button type="button" onClick={() => setSelected(null)} aria-label="Close account details">Close ×</button>}</div>
      {!selected && <div className="team-editor-placeholder"><h2>Select a team member</h2><p>Choose an account to preview its role and access controls, or start a new staff account.</p></div>}
      {creating && <div className="team-editor-fields"><h2>Add team member</h2><p className="team-preview-note">Interface preview only. No account will be created and no email will be sent.</p><label>Full name<input type="text" placeholder="Employee name" maxLength={120} autoComplete="off" /></label><label>Email address<input type="email" placeholder="name@example.com" autoComplete="off" /></label><label>Initial role<select defaultValue="staff"><option value="staff">Staff — manage products and media</option><option value="super_admin">Super admin — manage team and categories</option></select></label><p className="team-field-help">Staff cannot create categories or change team permissions.</p><button className="btn btn-primary" type="button" disabled>Create account — coming later</button></div>}
      {editing && <div className="team-editor-fields" key={editing.user_id}><h2>{editing.display_name}</h2><p className="team-preview-note">Interface preview only. Changes to this account cannot be saved yet.</p><label>Display name<input type="text" defaultValue={editing.display_name} maxLength={120} /></label><label>Role<select defaultValue={editing.role}><option value="staff">Staff — products and media</option><option value="super_admin">Super admin — full management</option></select></label><div className="team-account-state"><span><strong>Account status</strong><small>{editing.active ? "Active accounts can sign in and use their assigned role." : "Disabled accounts cannot access Admin."}</small></span><span className={`team-state${editing.active ? " active" : ""}`}>{editing.active ? "Active" : "Disabled"}</span></div><button className="btn btn-primary" type="button" disabled>Save changes — coming later</button><div className="team-danger"><h3>Account actions</h3><p>Disabling or deleting an account will require confirmation when account management is enabled. The last active super admin must be protected.</p><div><button type="button" disabled>{editing.active ? "Disable account" : "Enable account"}</button><button type="button" disabled>Delete account</button></div></div></div>}
    </aside></div>
  </div>;
}
