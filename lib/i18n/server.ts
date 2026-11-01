import "server-only";
import { cookies } from "next/headers";
import { createTranslator, LOCALE_COOKIE, resolveLocale } from "./messages";

export async function getI18n() {
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return { locale, t: createTranslator(locale) };
}
