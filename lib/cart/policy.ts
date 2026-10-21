import type { CartItem, CartSyncRequest } from "@/lib/types";

export const CART_STORAGE_KEY = "aven-furniture-cart-v1";
export const MAX_CART_ITEMS = 100;
export const MAX_CART_QUANTITY = 999;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cartItem(value: unknown): CartItem | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { productId?: unknown; quantity?: unknown };
  if (typeof candidate.productId !== "string" || !uuid.test(candidate.productId) ||
      !Number.isSafeInteger(candidate.quantity) || Number(candidate.quantity) < 1) return null;
  return { productId: candidate.productId.toLowerCase(), quantity: Math.min(MAX_CART_QUANTITY, Number(candidate.quantity)) };
}

/** Validate, deduplicate and bound untrusted browser cart data. */
export function normalizeCartItems(value: unknown, publishedProductIds?: ReadonlySet<string>): CartItem[] {
  if (!Array.isArray(value)) return [];
  const quantities = new Map<string, number>();
  for (const valueItem of value) {
    const item = cartItem(valueItem);
    if (!item || (publishedProductIds && !publishedProductIds.has(item.productId))) continue;
    if (!quantities.has(item.productId) && quantities.size >= MAX_CART_ITEMS) continue;
    quantities.set(item.productId, Math.min(MAX_CART_QUANTITY, (quantities.get(item.productId) ?? 0) + item.quantity));
  }
  return [...quantities].map(([productId, quantity]) => ({ productId, quantity }));
}

/** Server-only items are retained; matching local quantities are added and capped. */
export function mergeCartItems(serverItems: unknown, localItems: unknown, publishedProductIds?: ReadonlySet<string>): CartItem[] {
  return normalizeCartItems([
    ...normalizeCartItems(serverItems, publishedProductIds),
    ...normalizeCartItems(localItems, publishedProductIds),
  ], publishedProductIds);
}

export function parseCartSyncRequest(value: unknown): CartSyncRequest | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as { items?: unknown }).items)) return null;
  return { items: normalizeCartItems((value as { items: unknown[] }).items) };
}

export function equalCartItems(left: unknown, right: unknown): boolean {
  const sort = (items: CartItem[]) => [...items].sort((a, b) => a.productId.localeCompare(b.productId));
  const a = sort(normalizeCartItems(left));
  const b = sort(normalizeCartItems(right));
  return a.length === b.length && a.every((item, index) => item.productId === b[index].productId && item.quantity === b[index].quantity);
}
