import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { normalizeNewsletterEmail, type NewsletterConsent, type UnsubscribeVerification } from "./types";

export const newsletterConsentVersion = "2026-10";
export const newsletterRetention = Object.freeze({ pendingDays: 30, unsubscribedDays: 90 });
const tokenPattern = /^[0-9a-f]{64}$/;
const signedTokenPattern = /^v1\.([1-9][0-9]{0,11})\.([0-9a-f]{24})\.([0-9a-f]{64})\.([0-9a-f]{32})\.([0-9a-f]{64})$/;
export const maxSignedUnsubscribeTokenLength = 203;
export const unsubscribeLinkLifetimeSeconds = 30 * 24 * 60 * 60;
export const newsletterRateLimits = Object.freeze({ perIp: 20, perEmail: 5 });

export function parseNewsletterConsent(input: { email: unknown; accepted: unknown }): NewsletterConsent | null {
  if (input.accepted !== "on" && input.accepted !== true) return null;
  const email = normalizeNewsletterEmail(input.email);
  if (!email) return null;
  return { email, accepted: true, source: "newsletter_form", version: newsletterConsentVersion };
}

/** The raw 256-bit bearer token is stored only as a digest and encrypted in links. */
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

/** Encrypt and sign the database bearer token so a link cannot bypass expiry via the public RPC. */
export function signUnsubscribeToken(token: string, secret: string, now = Date.now()): string {
  if (!verifyUnsubscribeToken(token).valid || !secret || !Number.isFinite(now)) throw new Error("Invalid unsubscribe signing input");
  const expires = Math.floor(now / 1000) + unsubscribeLinkLifetimeSeconds;
  if (expires <= 0 || expires > 999_999_999_999) throw new Error("Invalid unsubscribe expiry");
  const iv = randomBytes(12);
  const key = createHmac("sha256", secret).update("newsletter-unsubscribe:encryption:v1").digest();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(token, "hex")), cipher.final()]);
  const payload = `v1.${expires}.${iv.toString("hex")}.${encrypted.toString("hex")}.${cipher.getAuthTag().toString("hex")}`;
  const signature = createHmac("sha256", secret).update(`newsletter-unsubscribe:signature:${payload}`).digest("hex");
  return `${payload}.${signature}`;
}

/** Always perform a fixed-length MAC comparison, including for malformed input. */
export function verifySignedUnsubscribeToken(input: unknown, secret: string, now = Date.now()): UnsubscribeVerification {
  if (!secret) throw new Error("Unsubscribe signing key is unavailable");
  const match = typeof input === "string" && input.length <= maxSignedUnsubscribeTokenLength ? signedTokenPattern.exec(input) : null;
  const payload = match ? `v1.${match[1]}.${match[2]}.${match[3]}.${match[4]}` : `v1.0.${"0".repeat(24)}.${"0".repeat(64)}.${"0".repeat(32)}`;
  const expected = createHmac("sha256", secret).update(`newsletter-unsubscribe:signature:${payload}`).digest();
  const supplied = Buffer.from(match?.[5] ?? "0".repeat(64), "hex");
  const signatureValid = timingSafeEqual(expected, supplied);
  const expires = match ? Number(match[1]) : 0;
  if (!match || !signatureValid) return { valid: false };
  try {
    const key = createHmac("sha256", secret).update("newsletter-unsubscribe:encryption:v1").digest();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(match[2], "hex"));
    decipher.setAuthTag(Buffer.from(match[4], "hex"));
    const token = Buffer.concat([decipher.update(Buffer.from(match[3], "hex")), decipher.final()]).toString("hex");
    return Number.isFinite(now) && expires > Math.floor(now / 1000) ? verifyUnsubscribeToken(token) : { valid: false };
  } catch {
    return { valid: false };
  }
}

/** A fresh random salt makes each stored metadata hash unlinkable across records. */
function redactMetadata(value: string): string {
  return createHash("sha256").update(randomBytes(32)).update(value, "utf8").digest("hex");
}

export function newsletterRateIdentity(ipHeader: string | null): string {
  const ip = ipHeader?.split(",", 1)[0].trim() ?? "";
  return isIP(ip) ? ip : "unknown";
}

export function consentMetadataHashes(ipHeader: string | null, userAgent: string | null) {
  const ip = newsletterRateIdentity(ipHeader);
  return {
    ipHash: ip !== "unknown" ? redactMetadata(ip) : null,
    userAgentHash: userAgent && userAgent.length <= 1024 ? redactMetadata(userAgent) : null,
  };
}
