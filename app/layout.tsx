import type { Metadata } from "next";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { StoreProvider } from "@/components/store/store-provider";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://avenfurniture.vercel.app"),
  title: { default: "AvenFurniture — Considered furniture for quiet living", template: "%s | AvenFurniture" },
  description: "Contemporary furniture shaped by natural materials, enduring craft, and the rituals of everyday life.",
  openGraph: { title: "AvenFurniture", description: "Considered furniture for quiet living.", type: "website", images: [{ url: "/brand/aven-furniture-logo.jpg", width: 932, height: 951 }] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><StoreProvider><Header/><main id="main-content">{children}</main><Footer/></StoreProvider></body></html>;
}
