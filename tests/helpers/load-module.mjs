import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";
const root = path.resolve(import.meta.dirname, "../..");
const nativeRequire = createRequire(import.meta.url);
export function loadModule(filename, overrides = {}, cache = new Map()) {
  const absolute = path.resolve(root, filename);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const loaded = { exports: {} }; cache.set(absolute, loaded);
  const code = ts.transpileModule(readFileSync(absolute, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const require = (name) => {
    if (name in overrides) return overrides[name];
    const localeFixture = i18nModule(name);
    if (localeFixture) return localeFixture;
    if (name.startsWith("@/")) return loadModule(name.slice(2) + ".ts", overrides, cache);
    if (name.startsWith(".")) return loadModule(path.resolve(path.dirname(absolute), name + ".ts"), overrides, cache);
    return nativeRequire(name);
  };
  new Function("require", "module", "exports", code)(require, loaded, loaded.exports);
  return loaded.exports;
}

// Unit harnesses supply the request/context boundary; translation itself is real.
// Browser E2E exercises the real provider, cookies, SSR and router refresh.
export function i18nModule(name, locale = "en") {
  if (name !== "@/lib/i18n/client" && name !== "@/lib/i18n/server") return undefined;
  const { createTranslator } = loadModule("lib/i18n/messages.ts");
  const state = { locale, t: createTranslator(locale), pending: false, setLocale() {} };
  return name.endsWith("/client") ? { useI18n: () => state } : { getI18n: async () => state };
}
