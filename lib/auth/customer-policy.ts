import type { CustomerIdentity, CustomerInquiryOwnership, CustomerProfileInput } from "@/lib/types";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizeCustomerEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length <= 254 && email.test(normalized) ? normalized : null;
}

export function parseCustomerProfileInput(value: unknown): CustomerProfileInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.displayName !== "string") return null;
  const displayName = input.displayName.trim();
  if (displayName.length < 1 || displayName.length > 120) return null;
  if (input.contactPhone != null && typeof input.contactPhone !== "string") return null;
  const contactPhone = typeof input.contactPhone === "string" ? input.contactPhone.trim() : "";
  if (contactPhone && (contactPhone.length > 30 || !/^\+?[0-9 ().-]{6,30}$/.test(contactPhone) || !/[0-9]/.test(contactPhone))) return null;
  return { displayName, contactPhone: contactPhone || null };
}

/** Only a trusted service may use inquiry-specific proof of contact control.
 * A matching email, including a confirmed Auth email, is insufficient alone.
 * Existing ownership is immutable here; disputes need staff resolution.
 */
export function inquiryCustomerLink(identity: CustomerIdentity, inquiryId: string, contactEmail: unknown,
  proof: CustomerInquiryOwnership | null, existingOwner: string | null = null): string | null {
  if (identity.kind !== "authenticated" || !uuid.test(identity.userId) || !identity.emailVerified || !identity.sessionValid) return null;
  if (!uuid.test(inquiryId) || !proof || !proof.contactVerified || proof.inquiryId !== inquiryId) return null;
  const confirmed = normalizeCustomerEmail(identity.email);
  if (!confirmed || confirmed !== normalizeCustomerEmail(contactEmail) || confirmed !== normalizeCustomerEmail(proof.verifiedContactEmail)) return null;
  if (existingOwner !== null && existingOwner !== identity.userId) return null;
  return identity.userId;
}

/** Use this before rendering an inquiry from a trusted server response. */
export function canReadCustomerInquiry(identity: CustomerIdentity, ownerId: string | null, authorizedStaff = false): boolean {
  if (authorizedStaff) return true;
  return identity.kind === "authenticated" && identity.sessionValid &&
    uuid.test(identity.userId) && ownerId === identity.userId;
}
