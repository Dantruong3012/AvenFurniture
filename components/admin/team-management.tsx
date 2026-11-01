"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeStaffRole, deleteStaff, inviteStaffAction, setStaffActive, type AuthState } from "@/lib/auth/actions";

export type TeamMember = { user_id: string; display_name: string; role: string; active: boolean; created_at: string; inviteStatus?: "pending" | "active" | "removed" | "unavailable"; email?: string };
const roleLabel = (role: string) => ({ super_admin: "Super admin", admin: "Admin", editor: "Editor / consultant", staff: "Staff" })[role as "super_admin" | "admin" | "editor" | "staff"] ?? role;
const accountStatus = (member: TeamMember) => member.inviteStatus === "removed" ? "Removed" : !member.active ? "Disabled" : member.inviteStatus === "pending" ? "Pending" : member.inviteStatus === "active" ? "Active" : "Unavailable";

export function TeamManagement({ members, managerId, managerRole }: { members: TeamMember[]; managerId: string; managerRole: "super_admin" | "admin" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<AuthState>({});
  const editorRef = useRef<HTMLElement>(null);
  const showDetails = (id: string) => {
    setSelected(id); setFeedback({});
    if (window.matchMedia("(max-width: 850px)").matches) requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const submit = (action: (form: FormData) => Promise<AuthState>, form: FormData) => {
    setFeedback({});
    startTransition(async () => {
      try {
        const result = await action(form);
        setFeedback(result);
        if (result.message) router.refresh();
      } catch { setFeedback({ error: "The request could not be completed. Try again." }); }
    });
  };
  const active = members.filter((member) => member.active && member.inviteStatus === "active").length;
  const invited = members.filter((member) => member.active && member.inviteStatus === "pending").length;
  const visible = useMemo(() => members.filter((member) =>
    (filter === "all" || (filter === "active" ? member.active && member.inviteStatus === "active" : filter === "pending" ? member.active && member.inviteStatus === "pending" : !member.active)) &&
    member.display_name.toLowerCase().includes(search.trim().toLowerCase())
  ), [members, search, filter]);
  const editing = members.find((member) => member.user_id === selected);
  const creating = selected === "new";
  const soleSuper = editing?.role === "super_admin" && editing.active && members.filter((member) => member.role === "super_admin" && member.active).length === 1;
  const canManage = editing && editing.inviteStatus !== "removed" && (managerRole === "super_admin" || editing.role !== "super_admin");
  const canEditAccess = managerRole === "super_admin" && !!editing && editing.inviteStatus !== "removed";

  return <div className="admin-content team-page">
    <header className="admin-header"><div><p className="section-note">Workspace settings</p><h1>Team & access</h1><p>Invite staff and manage roles and account access.</p></div>{managerRole === "super_admin" && <button className="btn btn-primary" type="button" onClick={() => showDetails("new")}>Invite team member</button>}</header>
    <div className="team-summary" aria-label="Team summary"><div><strong>{members.length}</strong><span>Total accounts</span></div><div><strong>{active}</strong><span>Active accounts</span></div><div><strong>{invited}</strong><span>Pending invitations</span></div><div><strong>{members.filter((member) => !member.active).length}</strong><span>Disabled accounts</span></div></div>
    <div className="team-layout"><section className="admin-panel team-list"><div className="admin-panel-heading"><div><p className="section-note">People</p><h2>Team members</h2></div></div>
      <div className="team-toolbar"><label><span className="sr-only">Search team members</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name" /></label><label><span className="sr-only">Filter account status</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All accounts</option><option value="active">Active</option><option value="pending">Pending</option><option value="disabled">Disabled</option></select></label></div>
      <div className="team-rows">{visible.map((member) => <button type="button" key={member.user_id} className={`team-row${selected === member.user_id ? " selected" : ""}`} onClick={() => showDetails(member.user_id)} aria-pressed={selected === member.user_id}>
        <span className="team-row-person"><span className="team-avatar" aria-hidden="true">{member.display_name.trim().charAt(0).toUpperCase() || "A"}</span><span><strong>{member.display_name}</strong><small>{member.email ?? `Added ${new Date(member.created_at).toLocaleDateString("en-US")}`}</small></span></span><span className="team-row-meta"><span>{roleLabel(member.role)}</span><span className={`team-state${accountStatus(member) === "Active" ? " active" : ""}`}>{accountStatus(member)}</span></span>
      </button>)}</div>
      {!visible.length && <div className="admin-empty"><h3>{members.length ? "No matching accounts" : "No team accounts found"}</h3></div>}
    </section><aside ref={editorRef} id="team-account-details" className="admin-panel team-editor" aria-label="Account details">
      <div className="team-editor-top"><p className="section-note">{creating ? "New invitation" : editing ? "Account details" : "Manage access"}</p>{selected && <button type="button" onClick={() => { setSelected(null); setFeedback({}); }} aria-label="Close account details">Close ×</button>}</div>
      {!selected && <div className="team-editor-placeholder"><h2>Select a team member</h2><p>Choose an account to manage its role and access{managerRole === "super_admin" ? ", or invite someone new" : ""}.</p></div>}
      {creating && managerRole === "super_admin" && <form className="team-editor-fields" onSubmit={(event) => { event.preventDefault(); submit(inviteStaffAction, new FormData(event.currentTarget)); }}><h2>Invite team member</h2><label>Full name<input name="display_name" type="text" maxLength={120} required autoComplete="name" /></label><label>Email address<input name="email" type="email" maxLength={254} required autoComplete="email" /></label><label>Initial role<select name="role" defaultValue="editor"><option value="editor">Editor / consultant</option><option value="admin">Admin</option><option value="staff">Staff</option></select></label><p className="team-field-help">An invitation email lets the person set a password.</p><button className="btn btn-primary" type="submit" disabled={pending}>Send invitation</button></form>}
      {editing && <div className="team-editor-fields" key={editing.user_id}><h2>{editing.display_name}</h2><p className="team-preview-note">{editing.user_id === managerId ? "This is your account." : "Changes to access take effect immediately."}</p>
        {editing.active && editing.inviteStatus === "pending" && editing.email && managerRole === "super_admin" && <form onSubmit={(event) => { event.preventDefault(); submit(inviteStaffAction, new FormData(event.currentTarget)); }}><input type="hidden" name="display_name" value={editing.display_name} /><input type="hidden" name="email" value={editing.email} /><input type="hidden" name="role" value={editing.role} /><p>Invitation pending for {editing.email}.</p><button className="btn" type="submit" disabled={pending}>Resend invitation</button></form>}
        {canEditAccess && <form key={editing.role} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const role = String(form.get("role") ?? ""); if (role !== editing.role && !window.confirm(`Change ${editing.display_name}'s role to ${roleLabel(role)}? Their current sessions will end.`)) return; submit(changeStaffRole, form); }}><input type="hidden" name="user_id" value={editing.user_id} /><label>Role<select name="role" defaultValue={editing.role} disabled={soleSuper || pending}><option value="editor">Editor</option><option value="admin">Admin</option><option value="super_admin">Super admin</option>{editing.role === "staff" && <option value="staff" disabled>Staff (legacy)</option>}</select></label><button className="btn btn-primary" type="submit" disabled={soleSuper || pending}>Save role</button></form>}
        <div className="team-account-state"><span><strong>Account status</strong><small>{editing.inviteStatus === "removed" ? "Auth credentials were removed. The disabled profile and history are retained." : !editing.active ? "Disabled accounts cannot access Admin." : editing.inviteStatus === "pending" ? "Waiting for invitation acceptance." : editing.inviteStatus === "active" ? "This account can sign in." : "The linked Auth account is unavailable."}</small></span><span className={`team-state${accountStatus(editing) === "Active" ? " active" : ""}`}>{accountStatus(editing)}</span></div>
        <div className="team-danger"><h3>Account actions</h3>{soleSuper && <p>The last active super admin cannot be disabled, deleted, or demoted.</p>}<div>{canEditAccess && <button type="button" disabled={soleSuper || pending} onClick={() => { const next = !editing.active; if (!window.confirm(`${next ? "Enable" : "Disable"} ${editing.display_name}'s account?${next ? " A fresh sign in will be required." : " Their current sessions will end immediately."}`)) return; const form = new FormData(); form.set("user_id", editing.user_id); form.set("active", String(next)); submit(setStaffActive, form); }}>{editing.active ? "Disable account" : "Enable account"}</button>}<button type="button" disabled={!canManage || soleSuper || pending} onClick={() => { if (!window.confirm(`Remove ${editing.display_name}'s Auth credentials and revoke access? Their team profile, inquiry assignments, notes, and audit history will be retained. This cannot be undone.`)) return; const form = new FormData(); form.set("user_id", editing.user_id); form.set("confirm", "DELETE"); submit(deleteStaff, form); }}>Remove account access</button></div></div>
      </div>}
      {(feedback.error || feedback.message) && <p role={feedback.error ? "alert" : "status"} className="team-field-help">{feedback.error ?? feedback.message}</p>}
    </aside></div>
  </div>;
}
