"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { CloseIcon, SearchIcon } from "@/components/ui/icons";
import { changeInquiryAssignment, changeInquiryStatus, createInquiryNote, getActiveInquiryStaff } from "@/lib/inquiries/actions";
import { inquiryStatuses } from "@/lib/validation/inquiry";
import type { ActiveInquiryStaff, AdminInquiryAssignmentDetail } from "@/lib/repositories/supabaseInquiryRepository";
import type { AdminInquiryActionState, AdminInquirySummary, InquiryPortalQuery } from "@/lib/types";
import { useI18n } from "@/lib/i18n/client";


const labels = { all: "All", new: "New", consulting: "Consulting", completed: "Completed", cancelled: "Cancelled" };
type InquiryMetrics = { total: number; byStatus: Record<(typeof inquiryStatuses)[number], { count: number; percentage: number }>; last7Days: number; last30Days: number };
const emptyMetrics: InquiryMetrics = { total: 0, byStatus: { new: { count: 0, percentage: 0 }, consulting: { count: 0, percentage: 0 }, completed: { count: 0, percentage: 0 }, cancelled: { count: 0, percentage: 0 } }, last7Days: 0, last30Days: 0 };

function inquiryHref(filters: InquiryPortalQuery, changes: Partial<InquiryPortalQuery> = {}) {
  const next = { ...filters, inquiry: undefined, ...changes };
  const params = new URLSearchParams({ status: next.status, page: String(next.page) });
  if (next.q) params.set("q", next.q);
  if (next.inquiry) params.set("inquiry", next.inquiry);
  return `/admin/inquiries?${params}`;
}

function date(value: string, locale: string) {
  // A fixed timezone keeps the server and browser render identical.
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));
}

function Feedback({ state }: { state: AdminInquiryActionState }) {
  const { t } = useI18n();
  return <>{state.error && <p role="alert" className="auth-error">{t(state.error ?? "")}</p>}{state.success && <p role="status" className="admin-toast">{t(state.success ?? "")}</p>}</>;
}

function InquiryDrawer({ id, detail, closeHref, currentUserId }: { id: string; detail: AdminInquiryAssignmentDetail | null; closeHref: string; currentUserId: string }) {
  const { t, locale } = useI18n();

  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [body, setBody] = useState("");
  const [staff, setStaff] = useState<ActiveInquiryStaff[]>([]);
  const [staffLoading, setStaffLoading] = useState(Boolean(detail));
  const [staffError, setStaffError] = useState("");
  const [statusState, statusAction, statusPending] = useActionState(changeInquiryStatus, {});
  const [assignmentState, assignmentAction, assignmentPending] = useActionState(changeInquiryAssignment, {});
  const [noteState, noteAction, notePending] = useActionState(async (previous: AdminInquiryActionState, form: FormData) => {
    const result = await createInquiryNote(previous, form);
    if (result.success) setBody("");
    return result;
  }, {});
  const pending = statusPending || assignmentPending || notePending;
  const close = () => { if (!pending) router.replace(closeHref, { scroll: false }); };

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      // The row may have left the active filter after a status update.
      const target = document.getElementById(`inquiry-${id}`) ?? document.getElementById("inquiry-search") ?? previousFocus;
      target?.focus({ preventScroll: true });
    };
  }, [id]);

  useEffect(() => {
    if (!detail) return;
    let mounted = true;
    getActiveInquiryStaff().then((members) => {
      if (mounted) setStaff(members);
    }).catch(() => {
      if (mounted) setStaffError("Active staff could not be loaded. Refresh and try again.");
    }).finally(() => {
      if (mounted) setStaffLoading(false);
    });
    return () => { mounted = false; };
  }, [id, detail]);

  return <dialog ref={dialogRef} className="inquiry-dialog inquiry-drawer" aria-labelledby="inquiry-detail-title" onCancel={(event) => { event.preventDefault(); close(); }}>
    <header className="inquiry-dialog-heading">
      <div><p className="section-note">{t("Customer inquiry")}</p><h2 id="inquiry-detail-title">{detail ? t("Inquiry #{v0}", { v0: detail.reference }) : t("Inquiry unavailable")}</h2></div>
      <button type="button" className="btn btn-outline" aria-label={t("Close inquiry details")} onClick={close} disabled={pending} autoFocus><CloseIcon /></button>
    </header>
    {!detail ? <p role="alert">{t("This inquiry was removed or is no longer available to your session.")}</p> : <>
      <section aria-labelledby="customer-heading">
        <h3 id="customer-heading">{t("Customer details")}</h3>
        <dl className="customer-details"><div><dt>{t("Name")}</dt><dd>{detail.contact_name}</dd></div><div><dt>{t("Phone")}</dt><dd>{detail.contact_phone}</dd></div><div><dt>{t("Email")}</dt><dd>{detail.contact_email || t("Not provided")}</dd></div><div><dt>{t("Created (Vietnam time)")}</dt><dd><time dateTime={detail.created_at}>{date(detail.created_at, locale)}</time></dd></div><div><dt>{t("Source")}</dt><dd><span className="status">{t(detail.source)}</span></dd></div><div><dt>{t("Status")}</dt><dd><span className="status">{t(detail.status ?? "")}</span></dd></div></dl>
      </section>
      <section aria-labelledby="message-heading"><h3 id="message-heading">{t("Customer message")}</h3><p className="verbatim">{detail.message || t("No message provided.")}</p></section>
      <section aria-labelledby="items-heading"><h3 id="items-heading">{t("Requested items (")}{detail.inquiry_items.length})</h3>
        {detail.inquiry_items.length ? <div className="admin-table-wrap"><table className="admin-table item-table"><caption className="sr-only">{t("Requested product snapshots")}</caption><thead><tr><th scope="col">{t("Product")}</th><th scope="col">{t("Quantity")}</th><th scope="col">{t("Unit price")}</th></tr></thead><tbody>{detail.inquiry_items.map((item) => <tr key={item.id}><td>{item.product_name}<small className="product-slug">{item.product_slug}</small></td><td>{item.quantity}</td><td>{item.unit_price === null ? t("Quote requested") : `${item.currency} ${item.unit_price.toFixed(2)}`}</td></tr>)}</tbody></table></div> : <p>{t("No products referenced.")}</p>}
        <p className="field-hint">{t("Items and prices reflect the customer's request.")}</p>
      </section>
      <section aria-labelledby="status-heading"><h3 id="status-heading">{t("Update status")}</h3>
        <form action={statusAction} className="contact-form">
          <input type="hidden" name="id" value={id} />
          <label htmlFor="inquiry-status">{t("Status")}</label><select id="inquiry-status" name="status" key={detail.status} defaultValue={detail.status} disabled={pending}>{inquiryStatuses.map((status) => <option key={status} value={status}>{t(labels[status] ?? "")}</option>)}</select>
          <button className="btn" disabled={pending}>{statusPending ? t("Saving…") : t("Save status")}</button><Feedback state={statusState} />
        </form>
      </section>
      <section aria-labelledby="assignment-heading"><h3 id="assignment-heading">{t("Staff assignment")}</h3>
        <form action={assignmentAction} className="contact-form">
          <input type="hidden" name="id" value={id} />
          <label htmlFor="inquiry-assignee">{t("Assigned staff member")}</label>
          <select id="inquiry-assignee" name="assignedTo" key={`${detail.assignee_id ?? ""}:${staffLoading}`} defaultValue={detail.assignee_id ?? ""} disabled={pending || staffLoading || Boolean(staffError)}>
            <option value="">{t("Unassigned")}</option>
            {staff.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name}</option>)}
            {detail.assignee_id && !staff.some((member) => member.user_id === detail.assignee_id) &&
              <option value={detail.assignee_id} disabled>{t("Current assignee is inactive or unavailable")}</option>}
          </select>
          {staffLoading && <p className="field-hint">{t("Loading active staff…")}</p>}
          {staffError && <p role="alert" className="auth-error">{t(staffError ?? "")}</p>}
          {!staffLoading && !staffError && !staff.length && <p className="field-hint">{t("No active staff members are available.")}</p>}
          <button className="btn" disabled={pending || staffLoading || Boolean(staffError)}>{assignmentPending ? t("Saving…") : t("Save assignment")}</button><Feedback state={assignmentState} />
        </form>
      </section>
      <section aria-labelledby="notes-heading"><h3 id="notes-heading">{t("Internal staff notes")}</h3><p>{t("Visible only to staff.")}</p>
        {detail.inquiry_notes.length ? <ol className="note-timeline">{detail.inquiry_notes.map((note) => <li key={note.id}><p className="note-meta"><strong>{note.author_id === currentUserId ? t("You") : t("Staff {v0}", { v0: note.author_id })}</strong><time dateTime={note.created_at}>{date(note.created_at, locale)}{" "}{t("(Vietnam time)")}</time></p><p className="verbatim">{note.body}</p></li>)}</ol> : <p>{t("No internal notes yet.")}</p>}
        <form action={noteAction} className="contact-form">
          <input type="hidden" name="id" value={id} />
          <label htmlFor="inquiry-note">{t("Add an internal note")}</label><textarea id="inquiry-note" name="body" rows={5} maxLength={10000} required value={body} onChange={(event) => setBody(event.target.value)} disabled={pending} aria-describedby="inquiry-note-limit" />
          <p id="inquiry-note-limit">{t("1–10000 characters.")}{" "}{body.length}/10000</p>
          <button className="btn" disabled={pending || !body.trim()}>{notePending ? t("Adding…") : t("Add note")}</button><Feedback state={noteState} />
        </form>
      </section>
    </>}
    <style jsx>{`
      .inquiry-drawer { position: fixed; inset: 0 0 0 auto; margin: 0; width: min(720px, 100%); max-width: 100%; height: 100dvh; max-height: 100dvh; border: 0; border-left: 1px solid var(--line); animation: slide-in .2s ease-out; }
      .inquiry-drawer section { border-top: 1px solid var(--line); padding: 24px 0; }
      .inquiry-drawer h3 { margin: 0 0 16px; font-size: 1.15rem; }
      .customer-details { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
      dt, .field-hint, .note-meta { color: var(--muted); font-size: .75rem; }
      dd { margin: 5px 0 0; overflow-wrap: anywhere; }
      .verbatim { white-space: pre-wrap; overflow-wrap: anywhere; font-size: .9rem; }
      .item-table { min-width: 420px; }
      .product-slug { display: block; color: var(--muted); }
      .note-timeline { list-style: none; padding: 0; }
      .note-timeline li { border-left: 2px solid var(--line); padding: 0 0 16px 16px; margin: 16px 0; }
      .note-meta { display: flex; flex-direction: column; overflow-wrap: anywhere; }
      .inquiry-drawer :global(.btn:disabled) { opacity: .55; cursor: not-allowed; }
      @keyframes slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
      @media (prefers-reduced-motion: reduce) { .inquiry-drawer { animation: none; } }
      @media (max-width: 480px) { .customer-details { grid-template-columns: 1fr; } }
    `}</style>
  </dialog>;
}

export function InquiryPortal({ inquiries, count, pageSize, filters, detail, currentUserId, metrics = emptyMetrics }: {
  inquiries: AdminInquirySummary[]; count: number; pageSize: number; filters: InquiryPortalQuery; detail: AdminInquiryAssignmentDetail | null; currentUserId: string; metrics?: InquiryMetrics;
}) {
  const { t, locale } = useI18n();

  const pages = Math.max(1, Math.min(10000, Math.ceil(count / pageSize)));
  return <>
    <header className="admin-header"><div><p className="section-note">{t("Customer requests")}</p><h1>{t("Inquiries")}</h1><p>{t("Follow up on contact messages and product quote requests.")}</p></div></header>
    <section className="inquiry-analytics" aria-label={t("Inquiry analytics")}>
      <article><h2>{t("Total inquiries")}</h2><p>{metrics.total}</p></article>
      {inquiryStatuses.map((status) => <article key={status}><h2>{t(labels[status] ?? "")}</h2><p>{metrics.byStatus[status].count} <small>({metrics.byStatus[status].percentage}%)</small></p></article>)}
      <article><h2>{t("Last 7 days")}</h2><p>{metrics.last7Days}</p></article><article><h2>{t("Last 30 days")}</h2><p>{metrics.last30Days}</p></article>
    </section>
    <form action="/api/admin/inquiries/export" method="get" className="admin-toolbar inquiry-export">
      <label>{t("Status")}{" "}<select name="status" defaultValue={filters.status}><option value="all">{t("All statuses")}</option>{inquiryStatuses.map((status) => <option key={status} value={status}>{t(labels[status] ?? "")}</option>)}</select></label>
      <label>{t("From")}{" "}<input type="date" name="from" /></label><label>{t("To")}{" "}<input type="date" name="to" /></label>
      <button className="btn" type="submit">{t("Export CSV")}</button>
    </form>
    <nav className="inquiry-filters" aria-label={t("Inquiry status")}>{(["all", ...inquiryStatuses] as const).map((status) => <Link key={status} href={inquiryHref(filters, { status, page: 1 })} aria-current={filters.status === status ? "page" : undefined}>{t(labels[status] ?? "")}</Link>)}</nav>
    <form action="/admin/inquiries" method="get" className="admin-toolbar inquiry-search" role="search">
      <input type="hidden" name="status" value={filters.status} />
      <label htmlFor="inquiry-search"><SearchIcon /><span className="sr-only">{t("Search by customer name, phone, or email")}</span><input id="inquiry-search" name="q" key={filters.q} defaultValue={filters.q} maxLength={200} placeholder={t("Name, phone, or email")} type="search" /></label>
      <button className="btn" type="submit">{t("Search")}</button>{filters.q && <Link href={inquiryHref(filters, { q: "", page: 1 })}>{t("Clear search")}</Link>}
    </form>
    <p className="result-count">{count} {count === 1 ? t("inquiry") : t("inquiries")}{" "}{t("· Dates shown in Vietnam time")}</p>
    <div className="admin-table-wrap"><table className="admin-table"><caption className="sr-only">{t("Customer inquiries")}</caption><thead><tr>{["Created", "Reference", "Customer", "Contact details", "Source", "Status", "Items"].map((heading) => <th scope="col" key={heading}>{t(heading ?? "")}</th>)}</tr></thead><tbody>{inquiries.map((inquiry) => <tr key={inquiry.id}>
      <td><time dateTime={inquiry.created_at}>{date(inquiry.created_at, locale)}</time></td><td><Link id={`inquiry-${inquiry.id}`} href={inquiryHref(filters, { inquiry: inquiry.id })} scroll={false} aria-label={t("Open inquiry #{v0}", { v0: inquiry.reference })} aria-haspopup="dialog">#{inquiry.reference}</Link></td><td>{inquiry.contact_name}</td><td><span className="contact-line">{inquiry.contact_phone}</span><span className="contact-line">{inquiry.contact_email || t("No email")}</span></td><td><span className="status">{t(inquiry.source)}</span></td><td><span className={`status ${inquiry.status === "completed" ? "active" : ""}`}>{t(inquiry.status ?? "")}</span></td><td>{inquiry.item_count}</td>
    </tr>)}</tbody></table></div>
    {!inquiries.length && <div className="empty-state compact"><h2>{t("No inquiries found")}</h2><p>{filters.page > 1 ? t("This page has no results. Return to the first page or adjust your filters.") : t("New requests will appear here. Try another status or search.")}</p><Link href={inquiryHref(filters, { page: 1, q: "", status: "all" })}>{t("View all inquiries")}</Link></div>}
    <nav className="inquiry-pagination" aria-label={t("Inquiry pagination")}><span>{t("Page")}{" "}{filters.page}{" "}{t("of")}{" "}{pages}</span>{filters.page > 1 && <><Link href={inquiryHref(filters, { page: 1 })}>{t("First page")}</Link><Link href={inquiryHref(filters, { page: Math.min(filters.page - 1, pages) })}>{t("Previous")}</Link></>}{filters.page < pages && <Link href={inquiryHref(filters, { page: filters.page + 1 })}>{t("Next")}</Link>}</nav>
    {filters.inquiry && <InquiryDrawer key={filters.inquiry} id={filters.inquiry} detail={detail} closeHref={inquiryHref(filters)} currentUserId={currentUserId} />}
    <style jsx>{`
      .inquiry-filters, .inquiry-pagination { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 24px 0; font-size: .8rem; }
      .inquiry-filters :global(a) { padding: 10px 14px; border: 1px solid var(--line); background: white; }
      .inquiry-filters :global(a[aria-current=page]) { background: var(--ink); color: white; }
      .inquiry-pagination :global(a) { padding: 10px; text-decoration: underline; }
      .inquiry-search { margin-top: 0; flex-wrap: wrap; }
      .inquiry-analytics { display: grid; grid-template-columns: repeat(auto-fit, minmax(145px, 1fr)); gap: 12px; margin: 24px 0; }
      .inquiry-analytics article { border: 1px solid var(--line); background: white; padding: 16px; }
      .inquiry-analytics h2 { margin: 0 0 8px; font-size: .8rem; font-weight: 500; }
      .inquiry-analytics p { margin: 0; font-size: 1.35rem; font-weight: 700; }
      .inquiry-analytics small { color: var(--muted); font-size: .8rem; }
      .inquiry-export { margin: 0 0 24px; flex-wrap: wrap; }
      .inquiry-export label { display: flex; align-items: center; gap: 8px; }
      .inquiry-search label { min-width: 0; }
      .inquiry-search input[type=search] { width: 100%; min-width: 0; }
      .inquiry-search input:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
      .result-count { margin: 16px 0; }
      .contact-line { display: block; overflow-wrap: anywhere; }
      td :global(a) { text-decoration: underline; font-weight: 700; padding: 12px 0; display: inline-block; }
    `}</style>
  </>;
}
