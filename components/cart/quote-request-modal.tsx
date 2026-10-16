"use client";

import { useState, type RefObject } from "react";
import { ContactForm, InquiryDialog } from "@/components/forms/contact-form";
import { formatCatalogPrice } from "@/lib/catalog/public";
import type { InquiryItemInput } from "@/lib/validation/inquiry";

export function QuoteRequestModal({ open, items, onClose, onSuccess, returnFocusRef }: { open: boolean; items: InquiryItemInput[]; onClose: () => void; onSuccess: () => void; returnFocusRef?: RefObject<HTMLElement | null> }) {
  const [pending, setPending] = useState(false);
  return <InquiryDialog open={open} onClose={onClose} pending={pending} title="Request a quote" returnFocusRef={returnFocusRef}>
    <ul className="inquiry-items">{items.map((item) => <li key={item.productId ?? item.productSlug}><strong>{item.productName}</strong><span>{item.quantity} × {formatCatalogPrice(item.unitPrice, item.currency)}</span></li>)}</ul>
    <p>Prices are indicative. We will confirm availability and delivery details with you.</p>
    <ContactForm source="cart" items={items} onSuccess={onSuccess} onPendingChange={setPending}/>
  </InquiryDialog>;
}
