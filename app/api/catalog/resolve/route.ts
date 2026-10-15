import { NextResponse } from "next/server";
import { getPublishedProductsByIds } from "@/lib/repositories/supabaseProductRepository";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function GET(request: Request) {
  const ids = new URL(request.url).searchParams.get("ids")?.split(",").filter(Boolean) || [];
  if (ids.length > 100 || ids.some((id) => !uuid.test(id))) return NextResponse.json({ error: "Invalid product IDs." }, { status: 400 });
  try { return NextResponse.json({ products: await getPublishedProductsByIds(ids) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return NextResponse.json({ error: "Products are temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "private, no-store" } }); }
}
