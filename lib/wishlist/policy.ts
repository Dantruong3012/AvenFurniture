export const WISHLIST_STORAGE_KEY = "aven-furniture-wishlist-v1";
export const MAX_WISHLIST_ITEMS = 100;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Validate, deduplicate and bound untrusted browser wishlist data. */
export function normalizeWishlistItems(value: unknown, publishedProductIds?: ReadonlySet<string>): string[] {
  if (!Array.isArray(value)) return [];
  const items: string[] = [];
  const seen = new Set<string>();
  for (const valueItem of value) {
    if (typeof valueItem !== "string" || !uuid.test(valueItem)) continue;
    const productId = valueItem.toLowerCase();
    if (seen.has(productId) || (publishedProductIds && !publishedProductIds.has(productId))) continue;
    seen.add(productId);
    items.push(productId);
    if (items.length === MAX_WISHLIST_ITEMS) break;
  }
  return items;
}

/** Retain account items and append new guest selections without duplicates. */
export function mergeWishlistItems(serverItems: unknown, localItems: unknown, publishedProductIds?: ReadonlySet<string>): string[] {
  return normalizeWishlistItems([
    ...normalizeWishlistItems(serverItems, publishedProductIds),
    ...normalizeWishlistItems(localItems, publishedProductIds),
  ], publishedProductIds);
}

export function parseWishlistSyncRequest(value: unknown): { items: string[] } | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as { items?: unknown }).items)) return null;
  return { items: normalizeWishlistItems((value as { items: unknown[] }).items) };
}

