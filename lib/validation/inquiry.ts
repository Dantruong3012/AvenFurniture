import { uuidPattern } from "./catalog";

export const inquirySources = ["cart", "product", "contact", "manual"] as const;
export const inquiryStatuses = ["new", "consulting", "completed", "cancelled"] as const;
export type InquirySource = typeof inquirySources[number];
export type InquiryStatus = typeof inquiryStatuses[number];
export type InquiryItemInput = {
  productId?: string | null;
  productName: string;
  productSlug: string;
  quantity: number;
  currency: string;
  unitPrice: number | null;
};
export type CustomerInquiryInput = {
  idempotency_key?: string;
  contact_name: string;
  contact_phone: string;
  contact_email?: string | null;
  message?: string | null;
  source: InquirySource;
  items?: InquiryItemInput[];
  hp_company?: string;
};
export type ValidatedCustomerInquiryInput = {
  idempotency_key: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string | null;
  message: string;
  source: InquirySource;
  items: InquiryItemInput[];
};
export type InquiryValidationResult =
  | { success: true; data: ValidatedCustomerInquiryInput }
  | { success: false; error: string; fields: Record<string, string> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateCustomerInquiryInput(input: unknown): InquiryValidationResult {
  if (!isRecord(input)) return { success: false, error: "Enter a valid inquiry.", fields: {} };
  // Reject unexpected honeypot types too; never coerce objects or arrays to empty text.
  if (input.hp_company !== undefined && input.hp_company !== "") {
    return { success: false, error: "Unable to accept this submission.", fields: {} };
  }
  const fields: Record<string, string> = {};
  const text = (record: Record<string, unknown>, key: string, field: string, min: number, max: number, optional = false) => {
    const raw = record[key];
    if (optional && (raw === undefined || raw === null)) return "";
    if (typeof raw !== "string") { fields[field] = "Enter text."; return ""; }
    const value = raw.trim();
    if (value.length < min || value.length > max || value.includes("\0")) fields[field] = `Enter ${min}–${max} characters.`;
    return value;
  };
  const contact_name = text(input, "contact_name", "contact_name", 1, 120);
  const contact_phone = text(input, "contact_phone", "contact_phone", 6, 30);
  if (!/^\+?[0-9 ().-]+$/.test(contact_phone) || !/[0-9]/.test(contact_phone)) fields.contact_phone = "Enter a valid phone number.";
  const contact_email = text(input, "contact_email", "contact_email", 0, 254, true) || null;
  if (contact_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact_email)) fields.contact_email = "Enter a valid email address.";
  // Preserve the customer's message verbatim, including meaningful whitespace.
  const message = input.message == null ? "" : input.message;
  if (typeof message !== "string" || message.length > 10000 || message.includes("\0")) fields.message = "Enter at most 10000 characters.";
  const source = input.source;
  if (!inquirySources.includes(source as InquirySource)) fields.source = "Choose a valid inquiry source.";
  const key = input.idempotency_key;
  if (key !== undefined && (typeof key !== "string" || !uuidPattern.test(key))) fields.idempotency_key = "Enter a valid submission key.";

  const items: InquiryItemInput[] = [];
  const rawItems = input.items === undefined ? [] : input.items;
  if (!Array.isArray(rawItems) || rawItems.length > 100) fields.items = "Provide an array of at most 100 items.";
  else for (let index = 0; index < rawItems.length; index++) {
    const item: unknown = rawItems[index];
    const prefix = `items.${index}`;
    if (!isRecord(item)) { fields[prefix] = "Enter a valid item."; continue; }
    const productName = text(item, "productName", `${prefix}.productName`, 1, 200);
    const productSlug = text(item, "productSlug", `${prefix}.productSlug`, 1, 160);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(productSlug)) fields[`${prefix}.productSlug`] = "Enter a valid product slug.";
    const productId = item.productId ?? null;
    if (productId !== null && (typeof productId !== "string" || !uuidPattern.test(productId))) fields[`${prefix}.productId`] = "Enter a valid product ID.";
    const { quantity, currency, unitPrice } = item;
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) fields[`${prefix}.quantity`] = "Enter a quantity from 1 to 999.";
    if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) fields[`${prefix}.currency`] = "Use a three-letter uppercase currency code.";
    // Match numeric(12,2)'s maximum as well as rejecting NaN and Infinity.
    if (unitPrice !== null && (typeof unitPrice !== "number" || !Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 9999999999.99)) fields[`${prefix}.unitPrice`] = "Enter a nonnegative price or null.";
    items.push({ productId: productId as string | null, productName, productSlug, quantity: quantity as number, currency: currency as string, unitPrice: unitPrice as number | null });
  }
  if (Object.keys(fields).length) return { success: false, error: "Check the inquiry fields and try again.", fields };
  return { success: true, data: {
    idempotency_key: (key as string | undefined) ?? crypto.randomUUID(),
    contact_name, contact_phone, contact_email, message: message as string, source: source as InquirySource, items,
  } };
}

export function inquiryError(code?: string) {
  switch (code) {
    case "22023": case "22P02": case "22003": case "23514": case "23502":
      return "Some inquiry values are invalid. Check the fields and try again.";
    case "23503": return "A selected product or assignee is no longer available. Refresh and try again.";
    case "42501": return "Your session or permissions no longer allow this action. Sign in again.";
    default: return "Unable to save the inquiry. Retry with the same submission key if the result is uncertain.";
  }
}
