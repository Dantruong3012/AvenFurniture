"use server";

import { headers } from "next/headers";
import { allowAuthMutation } from "@/lib/auth/mutation";
import { createServiceClient } from "@/lib/supabase/admin";
import { consentMetadataHashes, generateUnsubscribeToken, hashUnsubscribeToken, newsletterRateIdentity, newsletterRateLimits, parseNewsletterConsent, verifySignedUnsubscribeToken } from "./policy";
import type { NewsletterActionState } from "./types";

/** Public opt-in. The same response for new and existing email addresses prevents roster discovery. */
export async function subscribeNewsletter(_previous: NewsletterActionState, form: FormData): Promise<NewsletterActionState> {
  const consent = parseNewsletterConsent({ email: form.get("email"), accepted: form.get("consent") });
  if (!consent) return { error: "Enter a valid email and agree to receive the newsletter." };
  const requestHeaders = await headers();
  const ipHeader = requestHeaders.get("x-forwarded-for");
  // Both windows are bounded per process. The IP window also limits address rotation.
  if (!(await allowAuthMutation("newsletter-subscribe-ip", newsletterRateIdentity(ipHeader), newsletterRateLimits.perIp)) ||
      !(await allowAuthMutation("newsletter-subscribe-email", consent.email, newsletterRateLimits.perEmail))) {
    return { error: "Please wait before trying again." };
  }
  const metadata = consentMetadataHashes(ipHeader, requestHeaders.get("user-agent"));
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
  // Delivery must use signUnsubscribeToken(token, process.env.SUPABASE_SECRET_KEY)
  // on first insert. Never expose a bearer token in the public response or logs.
  return { success: "Your newsletter preference has been received." };
}

/** May be called without a session; only possession of the 256-bit token authorizes the change. */
export async function unsubscribeNewsletter(_previous: NewsletterActionState, form: FormData): Promise<NewsletterActionState> {
  let verification;
  try {
    verification = verifySignedUnsubscribeToken(form.get("token"), process.env.SUPABASE_SECRET_KEY ?? "");
  } catch {
    return { error: "Unable to update your preference. Please try again later." };
  }
  const genericResult = { success: "If this link is valid, your newsletter preference has been updated." };
  if (!verification.valid) return genericResult;
  if (!(await allowAuthMutation("newsletter-unsubscribe", verification.token, 20))) {
    return { error: "Please wait before trying again." };
  }
  try {
    const { error } = await createServiceClient().rpc("unsubscribe_newsletter", { p_token: verification.token });
    if (error) throw error;
  } catch {
    return { error: "Unable to update your preference. Please try again later." };
  }
  return genericResult;
}
