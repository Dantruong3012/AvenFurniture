import type { CustomerConfirmationData, ConsultantAssignmentData, EmailMessage, EmailTemplatePayload, InquiryItemEmailData, StatusUpdateData } from "./types";

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function clean(value: string, label: string, max = 500): string {
  const result = value.trim();
  if (!result || result.length > max || /[\r\n]/.test(result)) throw new Error(`Invalid email ${label}.`);
  return result;
}

function email(to: string, subject: string, text: string, html: string): EmailMessage {
  return { to: clean(to, "recipient", 254), subject: clean(subject, "subject", 200), text, html };
}

function itemLines(items: InquiryItemEmailData[] = []) {
  if (!Array.isArray(items) || items.length > 100) throw new Error("Invalid inquiry items.");
  const normalized = items.map((item) => {
    const name = clean(item.name, "item name", 200);
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) throw new Error("Invalid item quantity.");
    if (item.unitPrice != null && (!Number.isFinite(item.unitPrice) || item.unitPrice < 0)) throw new Error("Invalid item price.");
    const price = item.unitPrice == null ? "" : ` — ${item.currency ? `${clean(item.currency, "currency", 3)} ` : ""}${item.unitPrice.toFixed(2)}`;
    return `${item.quantity} × ${name}${price}`;
  });
  return normalized;
}

export function renderCustomerConfirmation(data: CustomerConfirmationData): EmailMessage {
  const name = clean(data.customerName, "customer name", 120);
  const reference = data.reference == null ? "" : ` (${clean(String(data.reference), "reference", 80)})`;
  const items = itemLines(data.items);
  const text = `Hello ${name},\n\nThank you for your inquiry${reference}. We have received your request and our team will be in touch.${items.length ? `\n\nItems:\n${items.map((item) => `• ${item}`).join("\n")}` : ""}`;
  const list = items.length ? `<h2>Items</h2><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "";
  return email(data.to, "We received your inquiry", text, `<main><p>Hello ${escapeHtml(name)},</p><p>Thank you for your inquiry${escapeHtml(reference)}. We have received your request and our team will be in touch.</p>${list}</main>`);
}

export function renderConsultantAssignment(data: ConsultantAssignmentData): EmailMessage {
  const id = clean(data.inquiryId, "inquiry ID", 100), name = clean(data.customerName, "customer name", 120);
  let adminUrl: URL;
  try { adminUrl = new URL(data.adminUrl); } catch { throw new Error("Invalid admin URL."); }
  if (!/^https?:$/.test(adminUrl.protocol)) throw new Error("Invalid admin URL.");
  const notes = data.notes?.trim() ?? "";
  const contacts = [data.customerEmail && `Email: ${data.customerEmail}`, data.customerPhone && `Phone: ${data.customerPhone}`].filter(Boolean).join("\n") || "No contact details supplied.";
  const text = `Inquiry ${id} is assigned to you.\nCustomer: ${name}\n${contacts}\nNotes: ${notes || "None"}\n\nOpen inquiry: ${adminUrl.href}`;
  const html = `<main><h1>Inquiry assigned</h1><p>Inquiry ${escapeHtml(id)} is assigned to you.</p><p>Customer: ${escapeHtml(name)}</p><p>${escapeHtml(contacts).replace(/\n/g, "<br>")}</p><p>Notes: ${escapeHtml(notes || "None")}</p><p><a href="${escapeHtml(adminUrl.href)}">Open inquiry</a></p></main>`;
  return email(data.to, `Inquiry ${id} assigned to you`, text, html);
}

export function renderStatusUpdate(data: StatusUpdateData): EmailMessage {
  const id = clean(data.inquiryId, "inquiry ID", 100), name = clean(data.customerName, "customer name", 120);
  const status = clean(data.status, "status", 80).replace(/_/g, " ");
  const previous = data.previousStatus ? ` Status changed from ${clean(data.previousStatus, "previous status", 80).replace(/_/g, " ")} to ${status}.` : ` The current status is ${status}.`;
  const greeting = data.recipient === "customer" ? `Hello ${name},` : `Inquiry ${id} update:`;
  const reference = data.reference == null ? "" : ` (${clean(String(data.reference), "reference", 80)})`;
  const body = `${greeting}\n\nYour inquiry${reference}.${previous}`;
  return email(data.to, `Inquiry status update: ${status}`, body, `<main><p>${escapeHtml(greeting)}</p><p>Your inquiry${escapeHtml(reference)}.${escapeHtml(previous)}</p></main>`);
}

export function renderEmailTemplate(payload: EmailTemplatePayload): EmailMessage {
  switch (payload.template) {
    case "customer_confirmation": return renderCustomerConfirmation(payload.data);
    case "consultant_assignment": return renderConsultantAssignment(payload.data);
    case "status_update": return renderStatusUpdate(payload.data);
    default: return assertNever(payload);
  }
}

function assertNever(value: never): never { throw new Error(`Unsupported email template: ${String(value)}`); }
