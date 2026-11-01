import { NextResponse } from "next/server";
import { parseWishlistSyncRequest } from "@/lib/wishlist/policy";
import { listCustomerWishlistItems, synchronizeCustomerWishlist } from "@/lib/repositories/supabaseWishlistRepository";
import { createClient } from "@/lib/supabase/server";

async function authenticatedCustomer() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { response: NextResponse.json({ error: "Sign in to synchronize your wishlist." }, { status: 401 }) };
  if (!user.email_confirmed_at) return { response: NextResponse.json({ error: "Verify your email before synchronizing your wishlist." }, { status: 403 }) };
  return { supabase, user };
}

export async function GET() {
  const auth = await authenticatedCustomer();
  if ("response" in auth) return auth.response;
  try {
    const items = await listCustomerWishlistItems(auth.supabase, auth.user.id);
    return NextResponse.json({ items, synchronized: true });
  } catch {
    return NextResponse.json({ error: "Your wishlist is temporarily unavailable." }, { status: 503 });
  }
}

async function synchronize(request: Request, mode: "merge" | "replace") {
  const auth = await authenticatedCustomer();
  if ("response" in auth) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Send a valid wishlist." }, { status: 400 }); }
  const input = parseWishlistSyncRequest(body);
  if (!input) return NextResponse.json({ error: "Send a valid wishlist." }, { status: 400 });
  try {
    const items = await synchronizeCustomerWishlist(auth.supabase, auth.user.id, input.items, mode);
    return NextResponse.json({ items, synchronized: true });
  } catch {
    return NextResponse.json({ error: "Your wishlist is temporarily unavailable." }, { status: 503 });
  }
}

/** Merge browser-only guest selections when the customer signs in. */
export async function POST(request: Request) { return synchronize(request, "merge"); }
/** Persist subsequent authenticated edits as the account's current wishlist. */
export async function PUT(request: Request) { return synchronize(request, "replace"); }

