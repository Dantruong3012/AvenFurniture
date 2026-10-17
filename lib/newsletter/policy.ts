import { createHash, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import type { NewsletterConsent, UnsubscribeVerification } from "./types";

export const newsletterConsentVersion = "2026-10";
export const newsletterRetention = Object.freeze({ pendingDays: 30, unsubscribedDays: 90 });
const tokenPattern = /^[0-9a-f]{64}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseNewsletterConsent(input: { email: unknown; accepted: unknown }): NewsletterConsent | null {
  if (input.accepted !== "on" && input.accepted !== true) return null;
  if (typeof input.email !== "string") return null;
  const email = input.email.trim().toLowerCase();
  if (email.length > 254 || !emailPattern.test(email)) return null;
  return { email, accepted: true, source: "newsletter_form", version: newsletterConsentVersion };
}

/** The raw 256-bit bearer token belongs only in the recipient's unsubscribe link. */
export function generateUnsubscribeToken(): string {
  return randomBytes(32).toString("hex");
}

export function verifyUnsubscribeToken(input: unknown): UnsubscribeVerification {
  return typeof input === "string" && tokenPattern.test(input)
    ? { valid: true, token: input }
    : { valid: false };
}

export function hashUnsubscribeToken(token: string): string {
  if (!verifyUnsubscribeToken(token).valid) throw new Error("Invalid unsubscribe token");
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** A fresh random salt makes each stored metadata hash unlinkable across records. */
function redactMetadata(value: string): string {
  return createHash("sha256").update(randomBytes(32)).update(value, "utf8").digest("hex");
}

export function consentMetadataHashes(ipHeader: string | null, userAgent: string | null) {
  const ip = ipHeader?.split(",", 1)[0].trim() ?? "";
  return {
    ipHash: isIP(ip) ? redactMetadata(ip) : null,
    userAgentHash: userAgent && userAgent.length <= 1024 ? redactMetadata(userAgent) : null,
  };
}
