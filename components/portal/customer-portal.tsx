import type { CustomerInquiryRecord } from "@/lib/repositories/supabaseInquiryRepository";

const statusLabels: Record<string, string> = { new: "Received", consulting: "In progress", completed: "Completed", cancelled: "Cancelled" };
function date(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));
}

export function CustomerPortal({ inquiries, signedIn, error }: { inquiries: CustomerInquiryRecord[]; signedIn: boolean; error?: string }) {
  return <section className="customer-portal">
    <div className="customer-portal-intro"><p>Private inquiry history</p><h2>Your requests</h2>
      <p>Only inquiries explicitly linked to your signed-in account appear here. An email or phone match alone does not grant access.</p></div>
    {!signedIn && <p role="status">Sign in to a customer account to view linked inquiries. For a guest request, contact our team with your inquiry reference so they can verify ownership.</p>}
    {error && <p role="alert" className="auth-error">{error}</p>}
    {signedIn && !error && inquiries.length === 0 && <p role="status">No inquiries are linked to this account. Guest inquiries require independent ownership verification by our team.</p>}
    {signedIn && !error && inquiries.length > 0 && <div className="customer-inquiry-list">
      <h2>Your inquiries ({inquiries.length})</h2>
      {inquiries.map((inquiry) => <article className="customer-inquiry-card" key={`${inquiry.reference}-${inquiry.created_at}`}>
        <header><div><h3>Inquiry #{inquiry.reference}</h3><time dateTime={inquiry.created_at}>{date(inquiry.created_at)}</time></div><span className={`status status-${inquiry.status}`}>{statusLabels[inquiry.status] ?? "Received"}</span></header>
        {inquiry.inquiry_items.length > 0 && <section><h4>Requested items</h4><ul>{inquiry.inquiry_items.map((item) => <li key={item.id}>{item.product_name} <span>× {item.quantity}</span></li>)}</ul></section>}
        {inquiry.message && <section><h4>Your message</h4><p className="verbatim">{inquiry.message}</p></section>}
      </article>)}
    </div>}
    <style>{`
      .customer-portal { max-width: 760px; margin: 0 auto; }
      .customer-portal-intro { margin-bottom: 28px; }
      .customer-portal-intro > p:first-child { color: var(--muted); font-size: .78rem; letter-spacing: .12em; text-transform: uppercase; }
      .customer-portal-intro h2, .customer-inquiry-list > h2 { margin: 8px 0; }
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
