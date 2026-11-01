"use client";

import { useState } from "react";
import { ContactForm, InquiryDialog } from "@/components/forms/contact-form";
import { formatCatalogPrice, type CatalogProduct } from "@/lib/catalog/public";

export function ProductInquiryModal({ product, quantity = 1, open, onClose }: { product: CatalogProduct; quantity?: number; open: boolean; onClose: () => void }) {
  const [pending, setPending] = useState(false);
  const items = [{ productId: product.id, productName: product.name, productSlug: product.slug, quantity, currency: product.currency, unitPrice: product.price }];
  return <InquiryDialog open={open} onClose={onClose} pending={pending} title="Inquire about this piece">
    <p><strong>{product.name}</strong> · {quantity} × {formatCatalogPrice(product.price, product.currency)}</p>
    <p>Tell us what you would like to know. We will confirm pricing and availability with you.</p>
    <ContactForm source="product" items={items} onPendingChange={setPending}/>
  </InquiryDialog>;
}
