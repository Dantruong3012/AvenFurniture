import { viMessages } from "./vi";

export const LOCALE_COOKIE = "aven_locale";
export type Locale = "en" | "vi";
export const DEFAULT_LOCALE: Locale = "en";
export function resolveLocale(value: unknown): Locale {
  return value === "vi" ? "vi" : DEFAULT_LOCALE;
}
export type Values = Record<string, string | number>;
function vietnameseValidation(message: string) {
  const range = /^Enter (\d+)–(\d+) characters\.$/.exec(message);
  if (range) return "Nhập từ " + range[1] + "–" + range[2] + " ký tự.";
  const maximum = /^Enter at most (\d+) characters\.$/.exec(message);
  if (maximum) return "Nhập tối đa " + maximum[1] + " ký tự.";
  const bound = /^Too (small|big): expected string to have ([<>]=)(\d+) characters$/.exec(message);
  if (bound) return (bound[1] === "small" ? "Nhập ít nhất " : "Nhập tối đa ") + bound[3] + " ký tự.";
  return message;
}
export function translate(locale: Locale, message: string, values: Values = {}): string {
  if (typeof message !== "string") message = "Please try again.";
  const template = locale === "vi"
    ? Object.hasOwn(viMessages, message) ? viMessages[message] : vietnameseValidation(message)
    : message;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (placeholder, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : placeholder);
}
export function createTranslator(locale: Locale) {
  return (message: string, values?: Values) => translate(locale, message, values);
}
