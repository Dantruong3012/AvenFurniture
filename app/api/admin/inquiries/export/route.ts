import { requireAdmin } from "@/lib/auth/admin";
import { listAdminInquiriesForExport } from "@/lib/repositories/supabaseInquiryRepository";
import { inquiryStatuses } from "@/lib/validation/inquiry";

const columns = ["id", "created_at", "status", "name", "email", "phone", "product_id", "message"] as const;

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const { supabase } = await requireAdmin();
  const params = new URL(request.url).searchParams;
  const status = params.get("status") ?? "all";
  const from = params.get("from") ?? undefined;
  const to = params.get("to") ?? undefined;
  const validDate = (value: string | undefined) => value === undefined || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value);
  if (params.getAll("status").length > 1 || params.getAll("from").length > 1 || params.getAll("to").length > 1 ||
      (status !== "all" && !inquiryStatuses.includes(status as typeof inquiryStatuses[number])) ||
      !validDate(from) || !validDate(to) || (from && to && from > to)) {
    return Response.json({ error: "Choose valid inquiry export filters." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }

  try {
    const inquiries = await listAdminInquiriesForExport(supabase, { status: status as typeof inquiryStatuses[number] | "all", from, to });
    const records = inquiries.map((inquiry) => [
      inquiry.id, inquiry.created_at, inquiry.status, inquiry.contact_name, inquiry.contact_email, inquiry.contact_phone,
      inquiry.inquiry_items.map((item) => item.product_id).filter((id): id is string => id !== null).join(";"), inquiry.message,
    ]);
    const csv = [columns, ...records].map((record) => record.map(csvCell).join(",")).join("\r\n") + "\r\n";
    const filename = `inquiries-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(csv, { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    } });
  } catch {
    return Response.json({ error: "Inquiry export is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
