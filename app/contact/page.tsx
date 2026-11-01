import Link from "next/link";
import { ContactForm } from "@/components/forms/contact-form";
import { getI18n } from "@/lib/i18n/server";

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ source?: string | string[] }> }) {
  const { t } = await getI18n();

  const { source } = await searchParams;
  return <><header className="page-hero"><div className="container"><p className="section-note">{t("Visit or write")}</p><h1>{t("Let’s make space")}<br/>{t("for something lasting.")}</h1></div></header><section className="section container contact-layout"><div className="contact-info"><h2>{t("Our showroom")}</h2><p>{t("48 Nguyen Hue")}<br/>{t("District 1, Ho Chi Minh City")}</p><dl><div><dt>{t("Monday–Friday")}</dt><dd>9:00–18:00</dd></div><div><dt>{t("Saturday")}</dt><dd>10:00–17:00</dd></div><div><dt>{t("Sunday")}</dt><dd>{t("By appointment")}</dd></div></dl><a href="tel:+842838221126">+84 28 3822 1126</a><a href="mailto:studio@avenfurniture.com">{t("studio@avenfurniture.com")}</a></div><div className="contact-form"><h2>{source === "quote" ? t("Your quote list") : t("Contact the studio")}</h2><p>{source === "quote" ? t("Ask us a question about a quote. To send the products saved in your list, return to your quote list and choose Request a quote.") : t("Tell us about your space or ask a question about our furniture.")}</p><ContactForm/><Link className="btn btn-secondary" href={source === "quote" ? "/cart" : "/products"}>{source === "quote" ? t("Back to quote list") : t("Browse products")}</Link></div></section></>;
}
