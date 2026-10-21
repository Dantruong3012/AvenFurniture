import { NextResponse } from "next/server";
import { parseCartSyncRequest } from "@/lib/cart/policy";
import { listCustomerCartItems, synchronizeCustomerCart } from "@/lib/repositories/supabaseCartRepository";
import { createClient } from "@/lib/supabase/server";
import type { CartSyncResult } from "@/lib/types";

async function authenticatedCustomer() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { response: NextResponse.json({ error: "Sign in to synchronize your quote list." }, { status: 401 }) };
  if (!user.email_confirmed_at) return { response: NextResponse.json({ error: "Verify your email before synchronizing your quote list." }, { status: 403 }) };
  return { supabase, user };
}

export async function GET() {
  const auth = await authenticatedCustomer();
  if ("response" in auth) return auth.response;
  try {
    const stored = await listCustomerCartItems(auth.supabase, auth.user.id);
    const result: CartSyncResult = { items: stored.map(({ productId, quantity }) => ({ productId, quantity })), synchronized: true };
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Your quote list is temporarily unavailable." }, { status: 503 });
  }
}

async function synchronize(request: Request, mode: "merge" | "replace") {
  const auth = await authenticatedCustomer();
  if ("response" in auth) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Send a valid quote list." }, { status: 400 }); }
  const input = parseCartSyncRequest(body);
  if (!input) return NextResponse.json({ error: "Send a valid quote list." }, { status: 400 });
  try {
    const items = await synchronizeCustomerCart(auth.supabase, auth.user.id, input.items, mode);
    return NextResponse.json({ items, synchronized: true } satisfies CartSyncResult);
  } catch {
    return NextResponse.json({ error: "Your quote list is temporarily unavailable." }, { status: 503 });
  }
}

/** Merge browser-only guest selections once when the customer signs in. */
export async function POST(request: Request) { return synchronize(request, "merge"); }
/** Persist later authenticated edits without adding quantities a second time. */
export async function PUT(request: Request) { return synchronize(request, "replace"); }
