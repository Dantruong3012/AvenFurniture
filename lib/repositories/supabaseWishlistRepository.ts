import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mergeWishlistItems, normalizeWishlistItems } from "@/lib/wishlist/policy";
import type { Database } from "@/lib/supabase/database.types";

type WishlistRow = { id: string; user_id: string; product_id: string; created_at: string };
type WishlistTable = {
  Row: WishlistRow;
  Insert: { id?: string; user_id: string; product_id: string; created_at?: string };
  Update: never;
  Relationships: [];
};
type WishlistDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & { Tables: Database["public"]["Tables"] & { customer_wishlist_items: WishlistTable } };
};

function client(supabase: SupabaseClient<Database>) {
  return supabase as unknown as SupabaseClient<WishlistDatabase>;
}

function repositoryError(): Error {
  return new Error("Your wishlist is temporarily unavailable.");
}

async function rawItems(supabase: SupabaseClient<Database>, userId: string): Promise<WishlistRow[]> {
  const { data, error } = await client(supabase).from("customer_wishlist_items")
    .select("id,user_id,product_id,created_at").eq("user_id", userId)
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

export async function listCustomerWishlistItems(supabase: SupabaseClient<Database>, userId: string): Promise<string[]> {
  const rows = await rawItems(supabase, userId);
  const allowed = await publishedIds(supabase, rows.map(({ product_id }) => product_id));
  return normalizeWishlistItems(rows.map(({ product_id }) => product_id), allowed);
}

export async function addCustomerWishlistItems(supabase: SupabaseClient<Database>, userId: string, productIds: string[]): Promise<void> {
  const normalized = normalizeWishlistItems(productIds);
  if (!normalized.length) return;
  const { error } = await client(supabase).from("customer_wishlist_items").upsert(
    normalized.map((productId) => ({ user_id: userId, product_id: productId })),
    { onConflict: "user_id,product_id", ignoreDuplicates: true },
  );
  if (error) throw repositoryError();
}

export async function removeCustomerWishlistItems(supabase: SupabaseClient<Database>, userId: string, productIds: string[]): Promise<void> {
  const normalized = normalizeWishlistItems(productIds);
  if (!normalized.length) return;
  const { error } = await client(supabase).from("customer_wishlist_items").delete().eq("user_id", userId).in("product_id", normalized);
  if (error) throw repositoryError();
}

export async function synchronizeCustomerWishlist(
  supabase: SupabaseClient<Database>,
  userId: string,
  localItems: string[],
  mode: "merge" | "replace" = "merge",
): Promise<string[]> {
  const currentRows = await rawItems(supabase, userId);
  const candidateIds = [...new Set([
    ...currentRows.map(({ product_id }) => product_id),
    ...normalizeWishlistItems(localItems),
  ])];
  const allowed = await publishedIds(supabase, candidateIds);
  const serverItems = normalizeWishlistItems(currentRows.map(({ product_id }) => product_id), allowed);
  const desired = mode === "merge"
    ? mergeWishlistItems(serverItems, localItems, allowed)
    : normalizeWishlistItems(localItems, allowed);
  await addCustomerWishlistItems(supabase, userId, desired);
  const desiredIds = new Set(desired);
  await removeCustomerWishlistItems(
    supabase,
    userId,
    currentRows.map(({ product_id }) => product_id).filter((productId) => !desiredIds.has(productId)),
  );
  return desired;
}

