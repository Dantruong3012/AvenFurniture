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

/** A guest contact is a delivery address, never an Auth identity. */
export type CustomerIdentity =
  | { kind: "guest" }
  | { kind: "authenticated"; userId: string; email: string | null; emailVerified: boolean; sessionValid: boolean };

/** Customer profile fields are optional and separate from staff accounts. */
export type CustomerProfileInput = { displayName: string; contactPhone: string | null };

/** A trusted service must verify this particular inquiry's contact channel. */
export type CustomerInquiryOwnership = {
  inquiryId: string;
  verifiedContactEmail: string;
  contactVerified: boolean;
};

/** Guest wishlist entries stay client-side; authenticated entries store product IDs. */
export type CustomerWishlistItem = { productId: string; createdAt?: string };

export interface Collection {
  name: string;
  slug: string;
  description: string;
  image: string;
}

/** Collections are editorial views over existing product categories, not database rows. */
export interface CollectionDefinition extends Collection {
  title: string;
  metadata: {
    imageAlt: string;
    seoTitle: string;
    seoDescription: string;
  };
  /** A product belongs only when its public category slug equals this value. */
  association: { kind: "category"; categorySlug: string };
}

export type CollectionFilterQuery = {
  collection: string;
  q: string;
  material: string;
  price: "all" | "quote" | "priced" | "under-1000" | "1000-3000" | "over-3000";
  sort: "featured" | "newest" | "name" | "price-low" | "price-high";
  page: number;
};

/** Explicit membership is stored in products.attributes.collection_slugs. */
export interface CollectionProductAssociation {
  collectionSlug: string;
  productId: string;
}

export type CollectionAssociationPayload = {
  productId: string;
  collectionSlugs: string[];
};

export type CollectionWithProducts = {
  collection: CollectionDefinition;
  productIds: string[];
  products: Tables<"products">[];
};

/** Frontmatter of a locally committed .md journal article. Dates are ISO calendar dates (YYYY-MM-DD). */
export interface JournalFrontmatter {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  author: string;
  reviewer: string;
  lastUpdated: string;
  tags: string[];
  coverImage: string;
  seoTitle: string;
  seoDescription: string;
  zaloCtaText: string;
  /** Provide at least one Zalo destination; validation enforces this rule. */
  zaloCtaPhone?: string;
  zaloCtaLink?: string;
}

/** Markdown body and validated frontmatter; no remote publication source is involved. */
export interface JournalArticle {
  frontmatter: JournalFrontmatter;
  body: string;
}
