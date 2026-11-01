"use client";

import { useI18n } from "@/lib/i18n/client";
import { resolveLocale } from "@/lib/i18n/messages";

export function LanguageSwitch() {
  const { locale, setLocale, pending, t } = useI18n();
  return <label className="language-switch">
    <span className="sr-only">{t("Language")}</span>
    <select aria-label={t("Language")} value={locale} disabled={pending} aria-busy={pending}
      onChange={(event) => setLocale(resolveLocale(event.target.value))}>
      <option value="en" lang="en">English</option>
      <option value="vi" lang="vi">Tiếng Việt</option>
    </select>
  </label>;
}
