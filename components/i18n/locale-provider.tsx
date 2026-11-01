"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { I18nContext } from "@/lib/i18n/client";
import { createTranslator, LOCALE_COOKIE, resolveLocale, type Locale } from "@/lib/i18n/messages";

export function LocaleProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, setSelectedLocale] = useState(initialLocale);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const value = useMemo(() => ({
    locale, pending, t: createTranslator(locale),
    setLocale(next: Locale) {
      const selected = resolveLocale(next);
      if (selected === locale || pending) return;
      document.cookie = LOCALE_COOKIE + "=" + selected + "; Path=/; Max-Age=31536000; SameSite=Lax" +
        (window.location.protocol === "https:" ? "; Secure" : "");
      setSelectedLocale(selected);
      startTransition(() => router.refresh());
    },
  }), [locale, pending, router]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
