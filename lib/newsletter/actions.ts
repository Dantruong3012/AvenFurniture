"use server";

import { headers } from "next/headers";
import { allowAuthMutation } from "@/lib/auth/mutation";
import { createServiceClient } from "@/lib/supabase/admin";
import { consentMetadataHashes, generateUnsubscribeToken, hashUnsubscribeToken, parseNewsletterConsent, verifyUnsubscribeToken } from "./policy";
import type { NewsletterActionState } from "./types";

/** Public opt-in. The same response for new and existing email addresses prevents roster discovery. */
export async function subscribeNewsletter(_previous: NewsletterActionState, form: FormData): Promise<NewsletterActionState> {
  const consent = parseNewsletterConsent({ email: form.get("email"), accepted: form.get("consent") });
  if (!consent) return { error: "Enter a valid email and agree to receive the newsletter." };
  if (!(await allowAuthMutation("newsletter-subscribe", consent.email, 5))) {
    return { error: "Please wait before trying again." };
  }
  const requestHeaders = await headers();
  const metadata = consentMetadataHashes(requestHeaders.get("x-forwarded-for"), requestHeaders.get("user-agent"));
  const token = generateUnsubscribeToken();
  try {
    const { error } = await createServiceClient().rpc("subscribe_newsletter", {
      p_email: consent.email,
      p_source: consent.source,
      p_version: consent.version,
      p_token_digest: hashUnsubscribeToken(token),
      p_ip_hash: metadata.ipHash,
      p_user_agent_hash: metadata.userAgentHash,
    });
    if (error) throw error;
  } catch {
    return { error: "Unable to save your preference. Please try again later." };
  }
  // A delivery integration must send the raw token to the address on first insert.
  // It must never expose the token in this public response or write it to logs.
  return { success: "Your newsletter preference has been received." };
}

/** May be called without a session; only possession of the 256-bit token authorizes the change. */
export async function unsubscribeNewsletter(_previous: NewsletterActionState, form: FormData): Promise<NewsletterActionState> {
  const verification = verifyUnsubscribeToken(form.get("token"));
  if (!verification.valid) return { error: "This unsubscribe link is invalid." };
  if (!(await allowAuthMutation("newsletter-unsubscribe", verification.token, 20))) {
    return { error: "Please wait before trying again." };
  }
  try {
    const { error } = await createServiceClient().rpc("unsubscribe_newsletter", { p_token: verification.token });
    if (error) throw error;
  } catch {
    return { error: "Unable to update your preference. Please try again later." };
  }
  return { success: "You are unsubscribed." };
}
