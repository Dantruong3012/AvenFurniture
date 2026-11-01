"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Footer } from "./footer";
import { Header } from "./header";
import { StoreProvider } from "@/components/store/store-provider";
import { LanguageSwitch } from "@/components/i18n/language-switch";

export function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) {
    return <><div className="admin-language-switch"><LanguageSwitch /></div><main id="main-content" className="admin-route">{children}</main></>;
  }
  return <StoreProvider><Header /><main id="main-content">{children}</main><Footer /></StoreProvider>;
}
