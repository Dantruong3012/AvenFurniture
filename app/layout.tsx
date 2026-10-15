import type { Metadata } from "next";
import { SiteChrome } from "@/components/layout/site-chrome";
import { siteOrigin } from "@/lib/catalog/site-url";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: { default: "AvenFurniture — Considered furniture for quiet living", template: "%s | AvenFurniture" },
  description: "Contemporary furniture shaped by natural materials, enduring craft, and the rituals of everyday life.",
  openGraph: { title: "AvenFurniture", description: "Considered furniture for quiet living.", type: "website", images: [{ url: "/brand/aven-furniture-logo.jpg", width: 932, height: 951 }] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><SiteChrome>{children}</SiteChrome></body></html>;
}
