import type { Database } from "@/lib/supabase/database.types";

/** Accept RFC dot-atom mailboxes with DNS hostnames, matching the stored schema. */
export function normalizeNewsletterEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  if (!email || email.length > 254 || !/^[\x21-\x7e]+$/.test(email)) return null;
  const parts = email.split("@");
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (local.length > 64 || domain.length > 253 || !local || !domain) return null;
  const atom = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+$/;
  if (local.split(".").some((part) => !atom.test(part))) return null;
  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  return email;
}

export type NewsletterSubscriber = Database["public"]["Tables"]["newsletter_subscribers"]["Row"];
export type NewsletterStatus = NewsletterSubscriber["status"];

export type NewsletterConsent = {
  email: string;
  accepted: true;
  source: "newsletter_form";
  version: string;
};

export type NewsletterActionState = {
  success?: string;
  error?: string;
};

export type UnsubscribeVerification = { valid: true; token: string } | { valid: false };
