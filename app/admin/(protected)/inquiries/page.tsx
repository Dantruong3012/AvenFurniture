import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { getAdminInquiryById, listAdminInquiries } from "@/lib/repositories/supabaseInquiryRepository";
import { parseInquiryPortalQuery } from "@/lib/validation/inquiry";
import { InquiryPortal } from "@/components/admin/inquiry-portal";

export default async function InquiriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, user } = await requireAdmin();
  let filters;
  try { filters = parseInquiryPortalQuery(await searchParams); }
  catch {
    return <section><h1>Inquiries</h1><p role="alert">Invalid inquiry filters. Use a valid status, page, and search of at most 200 characters.</p><Link href="/admin/inquiries">Reset filters</Link></section>;
  }
  const pageSize = 25;
  const { inquiries, count } = await listAdminInquiries(supabase, { ...filters, pageSize });
  const detail = filters.inquiry ? await getAdminInquiryById(supabase, filters.inquiry) : null;
  return <InquiryPortal inquiries={inquiries} count={count} pageSize={pageSize} filters={filters} detail={detail} currentUserId={user.id} />;
}
