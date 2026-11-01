import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { getAdminInquiryById, getAdminInquiryMetrics, listAdminInquiries } from "@/lib/repositories/supabaseInquiryRepository";
import { parseInquiryPortalQuery } from "@/lib/validation/inquiry";
import { InquiryPortal } from "@/components/admin/inquiry-portal";
import { getI18n } from "@/lib/i18n/server";


export default async function InquiriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t } = await getI18n();

  const { supabase, user } = await requireAdmin();
  let filters;
  try { filters = parseInquiryPortalQuery(await searchParams); }
  catch {
    return <section><h1>{t("Inquiries")}</h1><p role="alert">{t("Invalid inquiry filters. Use a valid status, page, and search of at most 200 characters.")}</p><Link href="/admin/inquiries">{t("Reset filters")}</Link></section>;
  }
  const pageSize = 25;
  const [{ inquiries, count }, metrics] = await Promise.all([
    listAdminInquiries(supabase, { ...filters, pageSize }),
    getAdminInquiryMetrics(supabase),
  ]);
  const detail = filters.inquiry ? await getAdminInquiryById(supabase, filters.inquiry) : null;
  return <InquiryPortal inquiries={inquiries} count={count} pageSize={pageSize} filters={filters} detail={detail} currentUserId={user.id} metrics={metrics} />;
}
