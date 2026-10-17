import type { Metadata } from "next";
import { CustomerPortal } from "@/components/portal/customer-portal";

export const metadata: Metadata = { title: "Your inquiries", description: "Look up your furniture inquiries and request status." };

export default function PortalPage() {
  return <><header className="page-hero"><div className="container"><p className="section-note">Customer care</p><h1>Your inquiries</h1><p>Review your requests and see the latest status from our team.</p></div></header><section className="section container"><CustomerPortal /></section></>;
}
