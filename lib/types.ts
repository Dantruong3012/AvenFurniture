import type { Tables } from "@/lib/supabase/database.types";
import type { InquiryStatus } from "@/lib/validation/inquiry";

// Only the fields rendered by the portal cross the server/client boundary.
export type AdminInquirySummary = Pick<Tables<"inquiries">,
  "id" | "reference" | "created_at" | "contact_name" | "contact_phone" | "contact_email" | "source" | "status"
> & { item_count: number };
export type AdminInquiryDetail = Omit<AdminInquirySummary, "item_count"> & {
  message: string;
  inquiry_items: Pick<Tables<"inquiry_items">, "id" | "product_name" | "product_slug" | "quantity" | "unit_price" | "currency">[];
  inquiry_notes: Pick<Tables<"inquiry_notes">, "id" | "body" | "created_at" | "author_id">[];
};
export type InquiryPortalQuery = { page: number; q: string; status: InquiryStatus | "all"; inquiry?: string };
export type AdminInquiryActionState = { error?: string; success?: string };

/** Aggregate delivery metrics only; no individual outbox record crosses this boundary. */
export type OutboxHealthSummary = {
  total: number;
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  deadLetter: number;
  retryBacklog: number;
  oldestPendingAgeSeconds: number | null;
  failureRatePercent: number;
};

export interface CartItem {
  productId: string;
  quantity: number;
}

export type StorefrontInquirySource = "cart" | "product" | "contact";

export type InquiryConfirmation = {
  success: true;
  id: string;
  reference: number;
  is_duplicate: boolean;
};

export interface Collection {
  name: string;
  slug: string;
  description: string;
  image: string;
}
