"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { deleteConsultant, saveConsultant } from "@/lib/consultants/actions";
import type { ConsultantMember, ConsultantProfile } from "@/lib/repositories/supabaseConsultantRepository";
import type { ConsultantState } from "@/lib/validation/consultant";
import { useI18n } from "@/lib/i18n/client";


export function ConsultantForm({ profile, members }: { profile?: ConsultantProfile; members: ConsultantMember[] }) {
  const { t } = useI18n();

  const [state, action, pending] = useActionState<ConsultantState, FormData>(saveConsultant, {});
  const [draft, setDraft] = useState({ user_id: profile?.user_id ?? "", public_name: profile?.public_name ?? "", avatar_url: profile?.avatar_url ?? "", zalo_phone: profile?.zalo_phone ?? "", sort_order: String(profile?.sort_order ?? 0), enabled: profile?.enabled ?? false });
  const fieldError = (name: string) => state.fields?.[name] ? <span className="field-error" id={`consultant-${name}-error`}>{t(state.fields[name] ?? "")}</span> : null;
  const input = (name: "public_name" | "avatar_url" | "zalo_phone" | "sort_order", label: string, options: React.InputHTMLAttributes<HTMLInputElement>) => <label>{t(label ?? "")}<input {...options} name={name} value={draft[name]} onChange={(event) => setDraft({ ...draft, [name]: event.target.value })} aria-invalid={!!state.fields?.[name]} aria-describedby={state.fields?.[name] ? `consultant-${name}-error` : undefined} />{fieldError(name)}</label>;
  return <section className="admin-modal catalog-editor"><h2>{profile ? t("Edit consultant") : t("Create consultant")}</h2>
    <p>{t("Publish a team member’s name and Zalo contact in the storefront directory. Only active team members appear publicly.")}</p>
    <form action={action} onSubmit={(event) => {
      // Keep controlled drafts intact when a server validation or conflict fails.
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      startTransition(() => action(data));
    }}>
      <input type="hidden" name="mode" value={profile ? "update" : "create"} />
      <input type="hidden" name="updated_at" value={profile?.updated_at ?? ""} />
      {state.error && <p role="alert" className="field-error">{t(state.error ?? "")}</p>}
      <fieldset className="catalog-fields" disabled={pending}>
        {profile ? <><input type="hidden" name="user_id" value={profile.user_id} /><p>{t("Team member:")}{" "}{members.find((member) => member.user_id === profile.user_id)?.display_name ?? t("Unavailable member")}</p></> : <label>{t("Team member")}<select name="user_id" required value={draft.user_id} onChange={(event) => setDraft({ ...draft, user_id: event.target.value })} aria-invalid={!!state.fields?.user_id} aria-describedby={state.fields?.user_id ? "consultant-user_id-error" : undefined}><option value="">{t("Choose an existing team member")}</option>{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name}{member.active ? "" : t(" (inactive)")}</option>)}</select>{fieldError("user_id")}</label>}
        {input("public_name", "Public name", { required: true, maxLength: 120 })}
        {input("avatar_url", "Avatar URL (optional Cloudinary image)", { type: "url", maxLength: 2048 })}
        {input("zalo_phone", "Zalo phone (9–15 digits, optional leading +)", { type: "tel", required: true, maxLength: 16, pattern: "[+]?[0-9]{9,15}" })}
        {input("sort_order", "Display order (lower numbers first)", { type: "number", required: true, step: 1, min: -2147483648, max: 2147483647 })}
        <label className="check-label"><input type="checkbox" name="enabled" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} aria-invalid={!!state.fields?.enabled} aria-describedby={state.fields?.enabled ? "consultant-enabled-error" : undefined} />{" "}{t("Visible in the public directory")}</label>{fieldError("enabled")}
        {!profile && !members.length && <p role="status">{t("Every team member already has a consultant profile, or there are no team members available.")}</p>}
        <div className="modal-actions"><Link className="btn btn-secondary" href="/admin/consultants">{t("Cancel")}</Link><button className="btn btn-primary" type="submit" disabled={pending || (!profile && !members.length)}>{pending ? t("Saving…") : t("Save consultant")}</button></div>
      </fieldset>
    </form>
  </section>;
}

export function DeleteConsultantForm({ profile }: { profile: ConsultantProfile }) {
  const { t } = useI18n();

  const [state, action, pending] = useActionState<ConsultantState, FormData>(deleteConsultant, {});
  return <details className="catalog-delete"><summary>{t("Delete consultant profile")}</summary><form action={action}>
    <input type="hidden" name="user_id" value={profile.user_id} /><input type="hidden" name="updated_at" value={profile.updated_at} />
    <p>{t("Delete the public profile for “")}{profile.public_name}{t("”? The team account will be kept.")}</p>
    {state.error && <p className="field-error" role="alert">{t(state.error ?? "")}</p>}
    <label><input name="confirmed" type="checkbox" required disabled={pending} />{" "}{t("I confirm deletion of this consultant profile.")}</label>
    <button type="submit" className="btn btn-secondary" disabled={pending}>{pending ? t("Deleting…") : t("Delete profile")}</button>
  </form></details>;
}
