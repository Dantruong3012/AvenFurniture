import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Database, Tables } from "@/lib/supabase/database.types";
import { uuidPattern } from "@/lib/validation/catalog";
import { inquiryError, inquiryStatuses, validateCustomerInquiryInput, validateInquiryNote, type CustomerInquiryInput, type CustomerInquiryLookup, type InquiryStatus } from "@/lib/validation/inquiry";
import type { AdminInquirySummary, AdminInquiryDetail } from "@/lib/types";
export type { AdminInquirySummary, AdminInquiryDetail } from "@/lib/types";

export type ActiveInquiryStaff = Pick<Tables<"admin_profiles">, "user_id" | "display_name">;
export type AdminInquiryAssignmentDetail = AdminInquiryDetail & { assignee_id: string | null };

export type InquirySubmissionResult = Database["public"]["Functions"]["submit_customer_inquiry"]["Returns"][number];
export type AdminInquiryFilters = { page?: number; pageSize?: number; status?: InquiryStatus | "all"; q?: string };
export type AdminInquiryDateFilters = { status?: InquiryStatus | "all"; from?: string; to?: string };
export type AdminInquiryMetrics = {
  total: number;
  byStatus: Record<InquiryStatus, { count: number; percentage: number }>;
  last7Days: number;
  last30Days: number;
};
const summaryColumns = "id,reference,created_at,contact_name,contact_phone,contact_email,source,status" as const;

export type CustomerInquiryRecord = Pick<Tables<"inquiries">, "reference" | "created_at" | "status" | "message"> & {
  inquiry_items: Pick<Tables<"inquiry_items">, "id" | "product_name" | "product_slug" | "quantity" | "unit_price" | "currency">[];
};

/** Exact contact match, bounded result set, and a customer-safe projection.
 * Internal consultant notes and assignment details never leave this repository.
 */
export async function lookupCustomerInquiries(identifier: CustomerInquiryLookup): Promise<CustomerInquiryRecord[]> {
  const columns = "reference,created_at,status,message,inquiry_items(id,product_name,product_slug,quantity,unit_price,currency)";
  let query = createServiceClient().from("inquiries").select(columns).is("deleted_at", null);
  if (identifier.type === "email") {
    const exact = `"${identifier.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    query = query.ilike("contact_email", exact);
  } else query = query.eq("contact_phone", identifier.value);
  const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(50);
  if (error) throw new Error("Customer inquiries are temporarily unavailable.");
  return (data ?? []) as unknown as CustomerInquiryRecord[];
}

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
  if (status !== undefined && status !== "all" && !inquiryStatuses.includes(status)) throw new Error("Choose a valid inquiry status.");
  if (q !== undefined && (typeof q !== "string" || q.length > 200 || q.includes("\0"))) throw new Error("Enter a search of at most 200 characters.");
  let query = supabase.from("inquiries").select(`${summaryColumns},inquiry_items(count)`, { count: "exact" }).is("deleted_at", null);
  if (status && status !== "all") query = query.eq("status", status);
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

function validateAdminInquiryDateFilters(filters: AdminInquiryDateFilters) {
  const { status, from, to } = filters;
  if (status !== undefined && status !== "all" && !inquiryStatuses.includes(status)) throw new Error("Choose a valid inquiry status.");
  for (const value of [from, to]) {
    if (value !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value)) {
      throw new Error("Choose valid inquiry dates.");
    }
  }
  if (from && to && from > to) throw new Error("The start date must be on or before the end date.");
}

/** Counts use the caller's RLS-scoped client and omit soft-deleted inquiries. */
export async function getAdminInquiryMetrics(supabase: SupabaseClient<Database>, now = new Date()): Promise<AdminInquiryMetrics> {
  const countQuery = () => supabase.from("inquiries").select("id", { count: "exact", head: true }).is("deleted_at", null);
  const statusQueries = inquiryStatuses.map(async (status) => {
    const { count, error } = await countQuery().eq("status", status);
    if (error) throw new Error("Inquiry metrics are temporarily unavailable.");
    return [status, count ?? 0] as const;
  });
  const sevenDays = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDays = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [statusCounts, last7, last30] = await Promise.all([
    Promise.all(statusQueries),
    countQuery().gte("created_at", sevenDays),
    countQuery().gte("created_at", thirtyDays),
  ]);
  if (last7.error || last30.error) throw new Error("Inquiry metrics are temporarily unavailable.");
  const byStatus = Object.fromEntries(statusCounts.map(([status, count]) => [status, { count, percentage: 0 }])) as AdminInquiryMetrics["byStatus"];
  const total = statusCounts.reduce((sum, [, count]) => sum + count, 0);
  for (const status of inquiryStatuses) byStatus[status].percentage = total ? Math.round((byStatus[status].count / total) * 1000) / 10 : 0;
  return { total, byStatus, last7Days: last7.count ?? 0, last30Days: last30.count ?? 0 };
}

/** Export in bounded pages so large inquiry histories do not hit PostgREST's row cap. */
export async function listAdminInquiriesForExport(supabase: SupabaseClient<Database>, filters: AdminInquiryDateFilters = {}) {
  validateAdminInquiryDateFilters(filters);
  const rows: Array<Pick<Tables<"inquiries">, "id" | "created_at" | "status" | "contact_name" | "contact_email" | "contact_phone" | "message"> & { inquiry_items: Array<{ product_id: string | null }> }> = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase.from("inquiries").select("id,created_at,status,contact_name,contact_email,contact_phone,message,inquiry_items(product_id)")
      .is("deleted_at", null).order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + pageSize - 1);
    if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
    if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00.000Z`);
    if (filters.to) query = query.lt("created_at", new Date(Date.parse(`${filters.to}T00:00:00.000Z`) + 24 * 60 * 60 * 1000).toISOString());
    const { data, error } = await query;
    if (error) throw new Error("Inquiry export is temporarily unavailable.");
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

export async function getAdminInquiryById(supabase: SupabaseClient<Database>, id: string): Promise<AdminInquiryAssignmentDetail | null> {
  requireId(id);
  const { data, error } = await supabase.from("inquiries").select(`${summaryColumns},assignee_id,message,inquiry_items(id,product_name,product_slug,quantity,unit_price,currency),inquiry_notes(id,body,created_at,author_id)`)
    .eq("id", id).is("deleted_at", null).order("created_at", { referencedTable: "inquiry_notes", ascending: true })
    .order("id", { referencedTable: "inquiry_notes", ascending: true })
    .order("id", { referencedTable: "inquiry_items", ascending: true }).maybeSingle();
  if (error) throw new Error("Inquiry details are temporarily unavailable.");
  return data;
}

/** Staff RLS permits only self reads. Call through an authorized server action. */
export async function listActiveInquiryStaff(): Promise<ActiveInquiryStaff[]> {
  const members: ActiveInquiryStaff[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await createServiceClient().from("admin_profiles")
      .select("user_id,display_name").eq("role", "staff").eq("active", true)
      .order("display_name").order("user_id").range(start, start + 999);
    if (error) throw new Error("Staff choices are temporarily unavailable.");
    members.push(...(data ?? []));
    if (!data || data.length < 1000) return members;
  }
}

export async function isActiveInquiryStaff(id: string): Promise<boolean> {
  requireId(id);
  const { data, error } = await createServiceClient().from("admin_profiles")
    .select("user_id").eq("user_id", id).eq("role", "staff").eq("active", true).maybeSingle();
  if (error) throw new Error("Unable to verify the staff member.");
  return Boolean(data);
}

export async function updateAdminInquiryAssignment(supabase: SupabaseClient<Database>, actorId: string, inquiryId: string, assignedTo: string | null): Promise<void> {
  requireId(actorId);
  requireId(inquiryId);
  if (assignedTo !== null) requireId(assignedTo);
  const { data, error } = await supabase.rpc("change_inquiry_assignment", {
    p_id: inquiryId, p_assignee_id: assignedTo, p_admin_url: assignedTo === null ? null : inquiryAdminUrl(inquiryId),
  });
  if (error) throw new Error(inquiryError(error.code));
  if (!data) throw new Error("Inquiry not found or no longer available to your session.");
}

function inquiryAdminUrl(id: string): string {
  const url = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Invalid site URL.");
  return `${url.origin}/admin/inquiries?inquiry=${id}`;
}

/** The RPC owns the inquiry mutation, assignment audit and outbox inserts. */
export async function updateAdminInquiryStatus(supabase: SupabaseClient<Database>, id: string, status?: InquiryStatus, assigneeId?: string | null): Promise<Tables<"inquiries">> {
  requireId(id);
  if (status !== undefined && !inquiryStatuses.includes(status)) throw new Error("Choose a valid inquiry status.");
  if (assigneeId !== undefined && assigneeId !== null) requireId(assigneeId);
  if (status === undefined && assigneeId === undefined) throw new Error("Choose a status or assignee to update.");
  const { data, error } = await supabase.rpc("change_inquiry_status", {
    p_id: id, p_status: status ?? null, p_assignee_id: assigneeId ?? null,
    p_change_assignee: assigneeId !== undefined,
    p_admin_url: assigneeId ? inquiryAdminUrl(id) : null,
  });
  if (error) throw new Error(inquiryError(error.code));
  if (!data) throw new Error("Inquiry not found or no longer available to your session.");
  return data;
}

export async function addAdminInquiryNote(supabase: SupabaseClient<Database>, inquiryId: string, body: string): Promise<Tables<"inquiry_notes">> {
  requireId(inquiryId);
  const note = validateInquiryNote(body);
  const parent = await supabase.from("inquiries").select("id").eq("id", inquiryId).is("deleted_at", null).maybeSingle();
  if (parent.error) throw new Error("Unable to verify the inquiry. Refresh and try again.");
  if (!parent.data) throw new Error("Inquiry not found or no longer available to your session.");
  const { data, error } = await supabase.from("inquiry_notes").insert({ inquiry_id: inquiryId, body: note }).select("*").single();
  // author_id comes from auth.uid() in PostgreSQL, never from submitted data.
  if (error) throw new Error(inquiryError(error.code));
  if (!data) throw new Error("Unable to add the inquiry note.");
  return data;
}
