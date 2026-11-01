import type { Metadata } from "next";
import { SiteChrome } from "@/components/layout/site-chrome";
import { siteOrigin } from "@/lib/catalog/site-url";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { getI18n } from "@/lib/i18n/server";
import { editorialFont, uiFont } from "./fonts";
import "./globals.css";
import "./typography.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
  metadataBase: new URL(siteOrigin()),
  title: { default: t("AvenFurniture — Considered furniture for quiet living"), template: "%s | AvenFurniture" },
  description: t("Contemporary furniture shaped by natural materials, enduring craft, and the rituals of everyday life."),
  openGraph: { title: "AvenFurniture", description: t("Considered furniture for quiet living."), type: "website", images: [{ url: "/brand/aven-furniture-logo.jpg", width: 932, height: 951 }] },
};
}


export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { locale } = await getI18n();
  return <html lang={locale} className={`${uiFont.variable} ${editorialFont.variable}`}><body><LocaleProvider initialLocale={locale}><SiteChrome>{children}</SiteChrome></LocaleProvider></body></html>;
}
