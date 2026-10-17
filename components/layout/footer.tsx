"use client";

import Link from "next/link";
import { useActionState, useState, type FormEvent } from "react";
import { subscribeNewsletter } from "@/lib/newsletter/actions";
import { normalizeNewsletterEmail, type NewsletterActionState } from "@/lib/newsletter/types";

function NewsletterForm() {
  const [state, action, pending] = useActionState<NewsletterActionState, FormData>(subscribeNewsletter, {});
  const [email, setEmail] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  const [dismissServerError, setDismissServerError] = useState(false);
  const serverError = !pending && !dismissServerError ? state.error : undefined;

  function validateBeforeSubmit(event: FormEvent<HTMLFormElement>) {
    const normalized = normalizeNewsletterEmail(email);
    if (!normalized) {
      event.preventDefault();
      setClientError("Enter a valid email address.");
      return;
    }
    setClientError(null);
    setDismissServerError(false);
    setEmail(normalized);
    const input = event.currentTarget.elements.namedItem("email");
    if (input instanceof HTMLInputElement) input.value = normalized;
  }

  return <div className="container" style={{ borderTop: "1px solid #34332f", padding: "32px 0 48px" }}>
    <h2 id="newsletter-heading">Notes from the studio</h2>
    <p>Occasional furniture and interiors stories, delivered by email.</p>
    {state.success ? <p role="status">{state.success}</p> : <form action={action} onSubmit={validateBeforeSubmit} aria-labelledby="newsletter-heading" style={{ maxWidth: 480 }}>
      <label htmlFor="newsletter-email" style={{ display: "block", marginTop: 18 }}>Email address</label>
      <input id="newsletter-email" name="email" type="email" autoComplete="email" required maxLength={254}
        value={email} onChange={(event) => { setEmail(event.target.value); setClientError(null); setDismissServerError(true); }}
        aria-invalid={Boolean(clientError || serverError)} aria-describedby="newsletter-feedback"
        style={{ display: "block", width: "100%", padding: 12, marginTop: 6, color: "#171714", background: "#fff", border: "1px solid #8f8b83" }} />
      <label style={{ display: "flex", alignItems: "start", gap: 10, marginTop: 14 }}>
        <input name="consent" type="checkbox" required value="on" onChange={() => setDismissServerError(true)} style={{ marginTop: 4 }} />
        I agree to receive the AvenFurniture newsletter by email.
      </label>
      <p id="newsletter-feedback" role={clientError || serverError ? "alert" : "status"} aria-live="polite" style={{ minHeight: 20, marginTop: 10 }}>
        {clientError || serverError || (pending ? "Saving your preference…" : "")}
      </p>
      <button type="submit" disabled={pending} style={{ minHeight: 44, padding: "10px 18px", marginTop: 8, color: "#171714", background: "#d8ccb9", border: 0, cursor: pending ? "wait" : "pointer" }}>
        {pending ? "Subscribing…" : "Subscribe"}
      </button>
    </form>}
  </div>;
}

export function Footer() {
  return <footer className="site-footer">
    <div className="container footer-grid">
      <div className="footer-brand"><Link href="/">AvenFurniture</Link><p>Furniture with quiet presence, made for rooms that become part of your story.</p></div>
      <div><h2>Explore</h2><Link href="/products">All products</Link><Link href="/collections">Collections</Link><Link href="/inspiration">Journal</Link><Link href="/wishlist">Wishlist</Link></div>
      <div><h2>Company</h2><Link href="/about">Our studio</Link><Link href="/contact">Showroom</Link><Link href="/contact">Trade programme</Link><Link href="/admin">Admin</Link></div>
      <div><h2>Visit</h2><p>48 Nguyen Hue<br/>District 1, Ho Chi Minh City</p><p>Mon–Sat, 9:00–18:00</p></div>
    </div>
    <NewsletterForm />
    <div className="container footer-bottom"><span>© 2026 AvenFurniture</span><span>Frontend demonstration</span></div>
  </footer>;
}
