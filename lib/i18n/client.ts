"use client";

import { createContext, useContext } from "react";
import { createTranslator, type Locale } from "./messages";

export type I18nContextValue = {
  locale: Locale;
  t: ReturnType<typeof createTranslator>;
  setLocale: (locale: Locale) => void;
  pending: boolean;
};
export const I18nContext = createContext<I18nContextValue>({
  locale: "en", t: createTranslator("en"), setLocale: () => {}, pending: false,
});
export function useI18n() {
  return useContext(I18nContext);
}
