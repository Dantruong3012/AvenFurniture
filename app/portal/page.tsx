import type { Metadata } from "next";
import { CustomerPortal } from "@/components/portal/customer-portal";
import { listCustomerInquiries } from "@/lib/repositories/supabaseInquiryRepository";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";


export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("Your inquiries"), description: t("View inquiries linked to your customer account."), robots: { index: false, follow: false }, referrer: "no-referrer" };
}


export default async function PortalPage() {
  const { t } = await getI18n();

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  let inquiries: Awaited<ReturnType<typeof listCustomerInquiries>> = [];
  let error: string | undefined;
  if (authError && authError.name !== "AuthSessionMissingError") error = "Account verification is temporarily unavailable. Please try again later.";
  else if (user) {
    try { inquiries = await listCustomerInquiries(supabase, user.id); }
    catch { error = "Your inquiries are temporarily unavailable. Please try again later."; }
  }
  return <><header className="page-hero"><div className="container"><p className="section-note">{t("Customer care")}</p><h1>{t("Your inquiries")}</h1><p>{t("Review requests linked to your account and see their current status.")}</p></div></header><section className="section container"><CustomerPortal inquiries={inquiries} signedIn={Boolean(user)} error={error} /></section></>;
}
