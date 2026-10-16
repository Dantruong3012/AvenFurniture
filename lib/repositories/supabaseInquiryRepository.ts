import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Database, Tables } from "@/lib/supabase/database.types";
import { uuidPattern } from "@/lib/validation/catalog";
import { inquiryError, inquiryStatuses, validateCustomerInquiryInput, type CustomerInquiryInput, type InquiryStatus } from "@/lib/validation/inquiry";

export type InquirySubmissionResult = Database["public"]["Functions"]["submit_customer_inquiry"]["Returns"][number];
export type AdminInquiryFilters = { page?: number; pageSize?: number; status?: InquiryStatus; q?: string };
export type AdminInquirySummary = Tables<"inquiries"> & { item_count: number };
export type AdminInquiryDetail = Tables<"inquiries"> & {
  inquiry_items: Tables<"inquiry_items">[];
  inquiry_notes: Tables<"inquiry_notes">[];
};

/** Call from a trusted server entry point after its request/rate-limit checks.
 * Retain the submission key across retries. Snapshots are customer requests,
 * not authoritative prices for orders or payments.
 */
export async function submitCustomerInquiry(input: CustomerInquiryInput): Promise<InquirySubmissionResult> {
  const validated = validateCustomerInquiryInput(input);
  if (!validated.success) throw new Error(validated.error);
  const data = validated.data;
  const { data: result, error } = await createServiceClient().rpc("submit_customer_inquiry", {
    p_idempotency_key: data.idempotency_key,
    p_contact_name: data.contact_name,
    p_contact_phone: data.contact_phone,
    p_contact_email: data.contact_email,
    p_message: data.message,
    p_source: data.source,
    // Store only the validated submission; ignore client-supplied status,
    // author, assignee, outbox fields and arbitrary original_submission data.
    p_original_submission: { ...data, items: data.items.map((item) => ({ ...item })) },
    p_items: data.items.map((item) => ({
      product_id: item.productId ?? null, product_name: item.productName, product_slug: item.productSlug,
      unit_price: item.unitPrice, currency: item.currency, quantity: item.quantity,
    })),
  });
  if (error) throw new Error(inquiryError(error.code));
  if (!result || result.length !== 1 || !result[0].id || result[0].reference == null) throw new Error(inquiryError());
  return result[0];
}

function requireId(id: string) {
  if (typeof id !== "string" || !uuidPattern.test(id)) throw new Error("Enter a valid inquiry or assignee ID.");
}

// Admin callers supply the authenticated client returned by requireAdmin().
// All reads and mutations retain that caller's RLS/session enforcement.
export async function listAdminInquiries(supabase: SupabaseClient<Database>, filters: AdminInquiryFilters = {}): Promise<{ inquiries: AdminInquirySummary[]; count: number }> {
  const { page = 1, pageSize = 25, status, q } = filters;
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error("Invalid inquiry page.");
  if (status !== undefined && !inquiryStatuses.includes(status)) throw new Error("Choose a valid inquiry status.");
  if (q !== undefined && (typeof q !== "string" || q.length > 200 || q.includes("\0"))) throw new Error("Enter a search of at most 200 characters.");
  let query = supabase.from("inquiries").select("*,inquiry_items(count)", { count: "exact" }).is("deleted_at", null);
  if (status) query = query.eq("status", status);
  if (q?.trim()) {
    // Escape LIKE wildcards, then quote/escape the PostgREST filter value so
    // commas, parentheses and quotes remain literal customer search text.
    const pattern = `%${q.trim().replace(/[\\%_]/g, "\\$&")}%`;
    const value = `"${pattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    query = query.or(`contact_name.ilike.${value},contact_phone.ilike.${value},contact_email.ilike.${value}`);
  }
  const { data, count, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw new Error("Inquiries are temporarily unavailable.");
  return { inquiries: (data ?? []).map(({ inquiry_items, ...inquiry }) => ({ ...inquiry, item_count: inquiry_items[0]?.count ?? 0 })), count: count ?? 0 };
}

export async function getAdminInquiryById(supabase: SupabaseClient<Database>, id: string): Promise<AdminInquiryDetail | null> {
  requireId(id);
  const { data, error } = await supabase.from("inquiries").select("*,inquiry_items(*),inquiry_notes(*)")
    .eq("id", id).is("deleted_at", null).order("created_at", { referencedTable: "inquiry_notes", ascending: true })
    .order("id", { referencedTable: "inquiry_notes", ascending: true }).maybeSingle();
  if (error) throw new Error("Inquiry details are temporarily unavailable.");
  return data;
}

/** Undefined preserves the current field; a null assignee clears assignment. */
export async function updateAdminInquiryStatus(supabase: SupabaseClient<Database>, id: string, status?: InquiryStatus, assigneeId?: string | null): Promise<Tables<"inquiries">> {
  requireId(id);
  if (status !== undefined && !inquiryStatuses.includes(status)) throw new Error("Choose a valid inquiry status.");
  if (assigneeId !== undefined && assigneeId !== null) requireId(assigneeId);
  if (status === undefined && assigneeId === undefined) throw new Error("Choose a status or assignee to update.");
  const changes: Database["public"]["Tables"]["inquiries"]["Update"] = {};
  if (status !== undefined) changes.status = status;
  if (assigneeId !== undefined) changes.assignee_id = assigneeId;
  const { data, error } = await supabase.from("inquiries").update(changes).eq("id", id).is("deleted_at", null).select("*").maybeSingle();
  if (error) throw new Error(inquiryError(error.code));
  if (!data) throw new Error("Inquiry not found or no longer available to your session.");
  return data;
}

export async function addAdminInquiryNote(supabase: SupabaseClient<Database>, inquiryId: string, body: string): Promise<Tables<"inquiry_notes">> {
  requireId(inquiryId);
  if (typeof body !== "string" || !body.trim() || body.trim().length > 10000 || body.includes("\0")) throw new Error("Enter a note of 1–10000 characters.");
  const { data, error } = await supabase.from("inquiry_notes").insert({ inquiry_id: inquiryId, body: body.trim() }).select("*").single();
  // author_id comes from auth.uid() in PostgreSQL, never from submitted data.
  if (error) throw new Error(inquiryError(error.code));
  if (!data) throw new Error("Unable to add the inquiry note.");
  return data;
}
