"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { CloseIcon, SearchIcon } from "@/components/ui/icons";
import { changeInquiryStatus, createInquiryNote } from "@/lib/inquiries/actions";
import { inquiryStatuses } from "@/lib/validation/inquiry";
import type { AdminInquiryActionState, AdminInquiryDetail, AdminInquirySummary, InquiryPortalQuery } from "@/lib/types";

const labels = { all: "All", new: "New", consulting: "Consulting", completed: "Completed", cancelled: "Cancelled" };

function inquiryHref(filters: InquiryPortalQuery, changes: Partial<InquiryPortalQuery> = {}) {
  const next = { ...filters, inquiry: undefined, ...changes };
  const params = new URLSearchParams({ status: next.status, page: String(next.page) });
  if (next.q) params.set("q", next.q);
  if (next.inquiry) params.set("inquiry", next.inquiry);
  return `/admin/inquiries?${params}`;
}

function date(value: string) {
  // A fixed timezone keeps the server and browser render identical.
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));
}

function Feedback({ state }: { state: AdminInquiryActionState }) {
  return <>{state.error && <p role="alert" className="auth-error">{state.error}</p>}{state.success && <p role="status" className="admin-toast">{state.success}</p>}</>;
}

function InquiryDrawer({ id, detail, closeHref, currentUserId }: { id: string; detail: AdminInquiryDetail | null; closeHref: string; currentUserId: string }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [body, setBody] = useState("");
  const [statusState, statusAction, statusPending] = useActionState(changeInquiryStatus, {});
  const [noteState, noteAction, notePending] = useActionState(async (previous: AdminInquiryActionState, form: FormData) => {
    const result = await createInquiryNote(previous, form);
    if (result.success) setBody("");
    return result;
  }, {});
  const pending = statusPending || notePending;
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

  return <dialog ref={dialogRef} className="inquiry-dialog inquiry-drawer" aria-labelledby="inquiry-detail-title" onCancel={(event) => { event.preventDefault(); close(); }}>
    <header className="inquiry-dialog-heading">
      <div><p className="section-note">Customer inquiry</p><h2 id="inquiry-detail-title">{detail ? `Inquiry #${detail.reference}` : "Inquiry unavailable"}</h2></div>
      <button type="button" className="btn btn-outline" aria-label="Close inquiry details" onClick={close} disabled={pending} autoFocus><CloseIcon /></button>
    </header>
    {!detail ? <p role="alert">This inquiry was removed or is no longer available to your session.</p> : <>
      <section aria-labelledby="customer-heading">
        <h3 id="customer-heading">Customer details</h3>
        <dl className="customer-details"><div><dt>Name</dt><dd>{detail.contact_name}</dd></div><div><dt>Phone</dt><dd>{detail.contact_phone}</dd></div><div><dt>Email</dt><dd>{detail.contact_email || "Not provided"}</dd></div><div><dt>Created (Vietnam time)</dt><dd><time dateTime={detail.created_at}>{date(detail.created_at)}</time></dd></div><div><dt>Source</dt><dd><span className="status">{detail.source}</span></dd></div><div><dt>Status</dt><dd><span className="status">{detail.status}</span></dd></div></dl>
      </section>
      <section aria-labelledby="message-heading"><h3 id="message-heading">Customer message</h3><p className="verbatim">{detail.message || "No message provided."}</p></section>
      <section aria-labelledby="items-heading"><h3 id="items-heading">Requested items ({detail.inquiry_items.length})</h3>
        {detail.inquiry_items.length ? <div className="admin-table-wrap"><table className="admin-table item-table"><caption className="sr-only">Requested product snapshots</caption><thead><tr><th scope="col">Product</th><th scope="col">Quantity</th><th scope="col">Unit price</th></tr></thead><tbody>{detail.inquiry_items.map((item) => <tr key={item.id}><td>{item.product_name}<small className="product-slug">{item.product_slug}</small></td><td>{item.quantity}</td><td>{item.unit_price === null ? "Quote requested" : `${item.currency} ${item.unit_price.toFixed(2)}`}</td></tr>)}</tbody></table></div> : <p>No products referenced.</p>}
        <p className="field-hint">Items and prices reflect the customer&apos;s request.</p>
      </section>
      <section aria-labelledby="status-heading"><h3 id="status-heading">Update status</h3>
        <form action={statusAction} className="contact-form">
          <input type="hidden" name="id" value={id} />
          <label htmlFor="inquiry-status">Status</label><select id="inquiry-status" name="status" key={detail.status} defaultValue={detail.status} disabled={pending}>{inquiryStatuses.map((status) => <option key={status} value={status}>{labels[status]}</option>)}</select>
          <button className="btn" disabled={pending}>{statusPending ? "Saving…" : "Save status"}</button><Feedback state={statusState} />
        </form>
      </section>
      <section aria-labelledby="notes-heading"><h3 id="notes-heading">Internal staff notes</h3><p>Visible only to staff.</p>
        {detail.inquiry_notes.length ? <ol className="note-timeline">{detail.inquiry_notes.map((note) => <li key={note.id}><p className="note-meta"><strong>{note.author_id === currentUserId ? "You" : `Staff ${note.author_id}`}</strong><time dateTime={note.created_at}>{date(note.created_at)} (Vietnam time)</time></p><p className="verbatim">{note.body}</p></li>)}</ol> : <p>No internal notes yet.</p>}
        <form action={noteAction} className="contact-form">
          <input type="hidden" name="id" value={id} />
          <label htmlFor="inquiry-note">Add an internal note</label><textarea id="inquiry-note" name="body" rows={5} maxLength={10000} required value={body} onChange={(event) => setBody(event.target.value)} disabled={pending} aria-describedby="inquiry-note-limit" />
          <p id="inquiry-note-limit">1–10000 characters. {body.length}/10000</p>
          <button className="btn" disabled={pending || !body.trim()}>{notePending ? "Adding…" : "Add note"}</button><Feedback state={noteState} />
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

export function InquiryPortal({ inquiries, count, pageSize, filters, detail, currentUserId }: {
  inquiries: AdminInquirySummary[]; count: number; pageSize: number; filters: InquiryPortalQuery; detail: AdminInquiryDetail | null; currentUserId: string;
}) {
  const pages = Math.max(1, Math.min(10000, Math.ceil(count / pageSize)));
  return <>
    <header className="admin-header"><div><p className="section-note">Customer requests</p><h1>Inquiries</h1><p>Follow up on contact messages and product quote requests.</p></div></header>
    <nav className="inquiry-filters" aria-label="Inquiry status">{(["all", ...inquiryStatuses] as const).map((status) => <Link key={status} href={inquiryHref(filters, { status, page: 1 })} aria-current={filters.status === status ? "page" : undefined}>{labels[status]}</Link>)}</nav>
    <form action="/admin/inquiries" method="get" className="admin-toolbar inquiry-search" role="search">
      <input type="hidden" name="status" value={filters.status} />
      <label htmlFor="inquiry-search"><SearchIcon /><span className="sr-only">Search by customer name, phone, or email</span><input id="inquiry-search" name="q" key={filters.q} defaultValue={filters.q} maxLength={200} placeholder="Name, phone, or email" type="search" /></label>
      <button className="btn" type="submit">Search</button>{filters.q && <Link href={inquiryHref(filters, { q: "", page: 1 })}>Clear search</Link>}
    </form>
    <p className="result-count">{count} {count === 1 ? "inquiry" : "inquiries"} · Dates shown in Vietnam time</p>
    <div className="admin-table-wrap"><table className="admin-table"><caption className="sr-only">Customer inquiries</caption><thead><tr>{["Created", "Reference", "Customer", "Contact details", "Source", "Status", "Items"].map((heading) => <th scope="col" key={heading}>{heading}</th>)}</tr></thead><tbody>{inquiries.map((inquiry) => <tr key={inquiry.id}>
      <td><time dateTime={inquiry.created_at}>{date(inquiry.created_at)}</time></td><td><Link id={`inquiry-${inquiry.id}`} href={inquiryHref(filters, { inquiry: inquiry.id })} scroll={false} aria-label={`Open inquiry #${inquiry.reference}`} aria-haspopup="dialog">#{inquiry.reference}</Link></td><td>{inquiry.contact_name}</td><td><span className="contact-line">{inquiry.contact_phone}</span><span className="contact-line">{inquiry.contact_email || "No email"}</span></td><td><span className="status">{inquiry.source}</span></td><td><span className={`status ${inquiry.status === "completed" ? "active" : ""}`}>{inquiry.status}</span></td><td>{inquiry.item_count}</td>
    </tr>)}</tbody></table></div>
    {!inquiries.length && <div className="empty-state compact"><h2>No inquiries found</h2><p>{filters.page > 1 ? "This page has no results. Return to the first page or adjust your filters." : "New requests will appear here. Try another status or search."}</p><Link href={inquiryHref(filters, { page: 1, q: "", status: "all" })}>View all inquiries</Link></div>}
    <nav className="inquiry-pagination" aria-label="Inquiry pagination"><span>Page {filters.page} of {pages}</span>{filters.page > 1 && <><Link href={inquiryHref(filters, { page: 1 })}>First page</Link><Link href={inquiryHref(filters, { page: Math.min(filters.page - 1, pages) })}>Previous</Link></>}{filters.page < pages && <Link href={inquiryHref(filters, { page: filters.page + 1 })}>Next</Link>}</nav>
    {filters.inquiry && <InquiryDrawer key={filters.inquiry} id={filters.inquiry} detail={detail} closeHref={inquiryHref(filters)} currentUserId={currentUserId} />}
    <style jsx>{`
      .inquiry-filters, .inquiry-pagination { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 24px 0; font-size: .8rem; }
      .inquiry-filters :global(a) { padding: 10px 14px; border: 1px solid var(--line); background: white; }
      .inquiry-filters :global(a[aria-current=page]) { background: var(--ink); color: white; }
      .inquiry-pagination :global(a) { padding: 10px; text-decoration: underline; }
      .inquiry-search { margin-top: 0; flex-wrap: wrap; }
      .inquiry-search label { min-width: 0; }
      .inquiry-search input[type=search] { width: 100%; min-width: 0; }
      .inquiry-search input:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
      .result-count { margin: 16px 0; }
      .contact-line { display: block; overflow-wrap: anywhere; }
      td :global(a) { text-decoration: underline; font-weight: 700; padding: 12px 0; display: inline-block; }
    `}</style>
  </>;
}
