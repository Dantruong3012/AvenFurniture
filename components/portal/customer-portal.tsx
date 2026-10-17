"use client";

import { useActionState } from "react";
import { lookupCustomerInquiries, type CustomerInquiryLookupState } from "@/lib/inquiries/actions";

const statusLabels: Record<string, string> = { new: "Received", consulting: "In progress", completed: "Completed", cancelled: "Cancelled" };
function date(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));
}

export function CustomerPortal() {
  const [state, action, pending] = useActionState<CustomerInquiryLookupState, FormData>(lookupCustomerInquiries, {});
  return <section className="customer-portal">
    <div className="customer-portal-intro"><p>Private inquiry lookup</p><h2>Find your requests</h2><p>Enter the same email address or phone number you shared with our team. We’ll show matching requests and their current status.</p></div>
    <form action={action} className="contact-form customer-lookup-form">
      <label htmlFor="lookup-type">Look up by</label>
      <select id="lookup-type" name="type" defaultValue="email"><option value="email">Email address</option><option value="phone">Phone number</option></select>
      <label htmlFor="lookup-value">Email or phone number</label>
      <input id="lookup-value" name="value" type="text" autoComplete="off" maxLength={254} required />
      <p className="field-hint">Use the exact contact detail from your inquiry. Phone numbers should use the same formatting as your original request.</p>
      {state.error && <p role="alert" className="auth-error">{state.error}</p>}
      {state.message && <p role="status">{state.message}</p>}
      <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "Searching…" : "Find my inquiries"}</button>
    </form>
    {state.inquiries && state.inquiries.length > 0 && <div className="customer-inquiry-list" aria-live="polite">
      <h2>Your inquiries ({state.inquiries.length})</h2>
      {state.inquiries.map((inquiry) => <article className="customer-inquiry-card" key={`${inquiry.reference}-${inquiry.created_at}`}>
        <header><div><h3>Inquiry #{inquiry.reference}</h3><time dateTime={inquiry.created_at}>{date(inquiry.created_at)}</time></div><span className={`status status-${inquiry.status}`}>{statusLabels[inquiry.status] ?? "Received"}</span></header>
        {inquiry.inquiry_items.length > 0 && <section><h4>Requested items</h4><ul>{inquiry.inquiry_items.map((item) => <li key={item.id}>{item.product_name} <span>× {item.quantity}</span></li>)}</ul></section>}
        {inquiry.message && <section><h4>Your message</h4><p className="verbatim">{inquiry.message}</p></section>}
      </article>)}
    </div>}
    <style jsx>{`
      .customer-portal { max-width: 760px; margin: 0 auto; }
      .customer-portal-intro { margin-bottom: 28px; }
      .customer-portal-intro > p:first-child { color: var(--muted); font-size: .78rem; letter-spacing: .12em; text-transform: uppercase; }
      .customer-portal-intro h2, .customer-inquiry-list > h2 { margin: 8px 0; }
      .customer-lookup-form { max-width: 560px; }
      .customer-inquiry-list { margin-top: 48px; }
      .customer-inquiry-card { border: 1px solid var(--line); padding: 24px; margin: 18px 0; background: var(--surface, #fff); }
      .customer-inquiry-card > header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
      .customer-inquiry-card h3 { margin: 0 0 6px; }
      .customer-inquiry-card time { color: var(--muted); font-size: .9rem; }
      .customer-inquiry-card section { border-top: 1px solid var(--line); margin-top: 18px; padding-top: 14px; }
      .customer-inquiry-card h4 { margin: 0 0 8px; }
      .customer-inquiry-card ul { margin: 0; padding-left: 20px; }
      .customer-inquiry-card li { margin: 5px 0; }
      @media (max-width: 520px) { .customer-inquiry-card { padding: 18px; } }
    `}</style>
  </section>;
}
