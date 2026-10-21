import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mergeCartItems, normalizeCartItems } from "@/lib/cart/policy";
import type { Database } from "@/lib/supabase/database.types";
import type { CartItem, CustomerCartItem } from "@/lib/types";

type CartRow = { user_id: string; product_id: string; quantity: number; created_at: string; updated_at: string };
type CartTable = {
  Row: CartRow;
  Insert: { user_id: string; product_id: string; quantity: number; created_at?: string; updated_at?: string };
  Update: { quantity?: number };
  Relationships: [];
};
type CartDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & { Tables: Database["public"]["Tables"] & { customer_cart_items: CartTable } };
};

function client(supabase: SupabaseClient<Database>) {
  return supabase as unknown as SupabaseClient<CartDatabase>;
}

function repositoryError(): Error {
  return new Error("Your quote list is temporarily unavailable.");
}

async function rawItems(supabase: SupabaseClient<Database>, userId: string): Promise<CartRow[]> {
  const { data, error } = await client(supabase).from("customer_cart_items")
    .select("user_id,product_id,quantity,created_at,updated_at").eq("user_id", userId)
    .order("created_at").order("product_id").limit(100);
  if (error) throw repositoryError();
  return data ?? [];
}

async function publishedIds(supabase: SupabaseClient<Database>, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data, error } = await supabase.from("products").select("id").eq("status", "published").in("id", ids);
  if (error) throw repositoryError();
  return new Set((data ?? []).map(({ id }) => id.toLowerCase()));
}

export async function listCustomerCartItems(supabase: SupabaseClient<Database>, userId: string): Promise<CustomerCartItem[]> {
  const rows = await rawItems(supabase, userId);
  const allowed = await publishedIds(supabase, rows.map(({ product_id }) => product_id));
  return rows.filter(({ product_id }) => allowed.has(product_id.toLowerCase())).map((row) => ({
    productId: row.product_id, quantity: row.quantity, createdAt: row.created_at, updatedAt: row.updated_at,
  }));
}

export async function upsertCustomerCartItems(supabase: SupabaseClient<Database>, userId: string, items: CartItem[]): Promise<void> {
  const normalized = normalizeCartItems(items);
  if (!normalized.length) return;
  const { error } = await client(supabase).from("customer_cart_items").upsert(
    normalized.map((item) => ({ user_id: userId, product_id: item.productId, quantity: item.quantity })),
    { onConflict: "user_id,product_id" },
  );
  if (error) throw repositoryError();
}

export async function removeCustomerCartItems(supabase: SupabaseClient<Database>, userId: string, productIds: string[]): Promise<void> {
  if (!productIds.length) return;
  const { error } = await client(supabase).from("customer_cart_items").delete().eq("user_id", userId).in("product_id", productIds);
  if (error) throw repositoryError();
}

export async function clearCustomerCart(supabase: SupabaseClient<Database>, userId: string): Promise<void> {
  const { error } = await client(supabase).from("customer_cart_items").delete().eq("user_id", userId);
  if (error) throw repositoryError();
}

export async function synchronizeCustomerCart(supabase: SupabaseClient<Database>, userId: string, localItems: CartItem[], mode: "merge" | "replace" = "merge"): Promise<CartItem[]> {
  const currentRows = await rawItems(supabase, userId);
  const candidateIds = [...new Set([
    ...currentRows.map((row) => row.product_id),
    ...normalizeCartItems(localItems).map(({ productId }) => productId),
  ])];
  const allowed = await publishedIds(supabase, candidateIds);
  const serverItems = normalizeCartItems(currentRows.map((row) => ({ productId: row.product_id, quantity: row.quantity })), allowed);
  const desired = mode === "merge" ? mergeCartItems(serverItems, localItems, allowed) : normalizeCartItems(localItems, allowed);
  await upsertCustomerCartItems(supabase, userId, desired);
  const desiredIds = new Set(desired.map(({ productId }) => productId));
  await removeCustomerCartItems(supabase, userId, currentRows.map(({ product_id }) => product_id).filter((id) => !desiredIds.has(id)));
  return desired;
}
