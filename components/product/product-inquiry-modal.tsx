"use client";

import { useState } from "react";
import { ContactForm, InquiryDialog } from "@/components/forms/contact-form";
import { formatCatalogPrice, type CatalogProduct } from "@/lib/catalog/public";
import { useI18n } from "@/lib/i18n/client";


export function ProductInquiryModal({ product, quantity = 1, open, onClose }: { product: CatalogProduct; quantity?: number; open: boolean; onClose: () => void }) {
  const { t, locale } = useI18n();

  const [pending, setPending] = useState(false);
  const items = [{ productId: product.id, productName: product.name, productSlug: product.slug, quantity, currency: product.currency, unitPrice: product.price }];
  return <InquiryDialog open={open} onClose={onClose} pending={pending} title={t("Inquire about this piece")}>
    <p><strong>{product.name}</strong> · {quantity} × {t(formatCatalogPrice(product.price, product.currency, locale === "vi" ? "vi-VN" : "en-US"))}</p>
    <p>{t("Tell us what you would like to know. We will confirm pricing and availability with you.")}</p>
    <ContactForm source="product" items={items} onPendingChange={setPending}/>
  </InquiryDialog>;
}
