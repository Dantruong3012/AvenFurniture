import type { Database } from "@/lib/supabase/database.types";

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
