"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { validateCustomerInquiryInput, type CustomerInquiryInput, type InquiryItemInput } from "@/lib/validation/inquiry";
import type { InquiryConfirmation, StorefrontInquirySource } from "@/lib/types";

type InquiryFormProps = {
  source?: StorefrontInquirySource;
  items?: InquiryItemInput[];
  onSuccess?: (confirmation: InquiryConfirmation) => void;
  onPendingChange?: (pending: boolean) => void;
};

export function ContactForm({ source = "contact", items = [], onSuccess, onPendingChange }: InquiryFormProps) {
  const prefix = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState<InquiryConfirmation | null>(null);
  const inFlight = useRef(false);
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const feedback = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error || confirmation) feedback.current?.focus();
  }, [error, fields, confirmation]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || confirmation) return;
    const form = new FormData(event.currentTarget);
    const input: CustomerInquiryInput = {
      source, items,
      contact_name: String(form.get("contact_name") ?? ""),
      contact_phone: String(form.get("contact_phone") ?? ""),
      contact_email: String(form.get("contact_email") ?? ""),
      message: String(form.get("message") ?? ""),
      hp_company: String(form.get("hp_company") ?? ""),
    };
    // An unchanged request keeps its key after network/server errors and dialog close.
    // A changed request is a new submission, never a replay with different contents.
    const signature = JSON.stringify(input);
    if (attempt.current?.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() };
    input.idempotency_key = attempt.current.key;
    const validated = validateCustomerInquiryInput(input);
    if (!validated.success) {
      setError(validated.error); setFields(validated.fields);
      return;
    }
    inFlight.current = true;
    onPendingChange?.(true);
    setPending(true); setError(""); setFields({});
    let result: InquiryConfirmation | null = null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch("/api/inquiries", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || data.success !== true) {
        setError(response.status === 400 ? data.error || "Check your inquiry fields." : "We could not confirm your inquiry. Please retry with the same details.");
        setFields(response.status === 400 ? data.fields ?? {} : {});
      } else if (typeof data.id !== "string" || !Number.isSafeInteger(data.reference) || typeof data.is_duplicate !== "boolean") {
        throw new Error("Invalid confirmation");
      } else {
        result = data;
        setConfirmation(result);
      }
    } catch {
      setError("We could not confirm your inquiry. Your details are still here; please retry with the same details.");
    } finally {
      clearTimeout(timeout);
      inFlight.current = false; setPending(false);
      onPendingChange?.(false);
    }
    if (result) onSuccess?.(result);
  }

  if (confirmation) return <div className="inquiry-confirmation" role="status" tabIndex={-1} ref={feedback}>
    <h3>Thank you for your inquiry.</h3>
    <p>Your reference is <strong>#{confirmation.reference}</strong>. Our studio will contact you using the details you provided.</p>
  </div>;

  const fieldProps = (name: string) => ({
    id: `${prefix}-${name}`, name,
    "aria-invalid": Boolean(fields[name]),
    "aria-describedby": fields[name] ? `${prefix}-${name}-error` : undefined,
  });
  const fieldError = (name: string) => fields[name] && <span className="inquiry-field-error" id={`${prefix}-${name}-error`}>{fields[name]}</span>;
  return <form className="inquiry-form" onSubmit={submit} noValidate aria-busy={pending}>
    <p>Name and phone are required. Email and notes are optional.</p>
    {error && <div className="inquiry-error" role="alert" tabIndex={-1} ref={feedback}><p>{error}</p>{Object.keys(fields).length > 0 && <ul>{Object.entries(fields).map(([name, text]) => <li key={name}>{text}</li>)}</ul>}</div>}
    <fieldset disabled={pending}>
      <label htmlFor={`${prefix}-contact_name`}>Your name<input {...fieldProps("contact_name")} autoComplete="name" required maxLength={120}/>{fieldError("contact_name")}</label>
      <label htmlFor={`${prefix}-contact_phone`}>Phone number<input {...fieldProps("contact_phone")} type="tel" autoComplete="tel" required minLength={6} maxLength={30}/>{fieldError("contact_phone")}</label>
      <label htmlFor={`${prefix}-contact_email`}>Email (optional)<input {...fieldProps("contact_email")} type="email" autoComplete="email" maxLength={254}/>{fieldError("contact_email")}</label>
      <label htmlFor={`${prefix}-message`}>Message (optional)<textarea {...fieldProps("message")} rows={4} maxLength={10000}/>{fieldError("message")}</label>
      <div className="inquiry-honeypot" aria-hidden="true"><label htmlFor={`${prefix}-hp_company`}>Leave this field empty<input id={`${prefix}-hp_company`} name="hp_company" tabIndex={-1} autoComplete="off"/></label></div>
      <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "Sending inquiry…" : source === "cart" ? "Send quote request" : "Send inquiry"}</button>
    </fieldset>
    {pending && <p role="status">Sending your inquiry. Please wait…</p>}
  </form>;
}

// Native modal dialogs contain keyboard focus, make the background inert, and
// restore focus to the trigger. Keep children mounted to preserve retry keys.
export function InquiryDialog({ open, onClose, title, children, pending = false, returnFocusRef }: { open: boolean; onClose: () => void; title: string; children: ReactNode; pending?: boolean; returnFocusRef?: RefObject<HTMLElement | null> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!element || !open) return;
    const trigger = document.activeElement;
    const fallbackFocus = returnFocusRef?.current;
    element.showModal();
    element.querySelector<HTMLInputElement>("input:not([tabindex='-1'])")?.focus();
    return () => {
      element.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
      else fallbackFocus?.focus();
    };
  }, [open, returnFocusRef]);
  return <dialog ref={dialog} className="inquiry-dialog" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); if (!pending) onClose(); }}>
    <div className="inquiry-dialog-heading"><h2 id={titleId}>{title}</h2><button type="button" className="btn btn-secondary" onClick={onClose} disabled={pending} aria-label="Close inquiry">Close</button></div>
    {children}
  </dialog>;
}
