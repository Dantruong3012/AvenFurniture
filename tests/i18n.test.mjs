import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { loadModule } from "./helpers/load-module.mjs";

const { resolveLocale, translate, createTranslator, LOCALE_COOKIE } = loadModule("lib/i18n/messages.ts");
const { viMessages } = loadModule("lib/i18n/vi.ts");

test("locale input is allowlisted, with English as the existing default", () => {
  assert.equal(resolveLocale("vi"), "vi");
  for (const value of [undefined, null, "en", "VI", "vi-VN", "fr", {}, ["vi"], "<script>", "__proto__"]) {
    assert.equal(resolveLocale(value), "en");
  }
  assert.equal(LOCALE_COOKIE, "aven_locale");
});

test("translations preserve placeholders and use own properties only", () => {
  for (const [key, value] of Object.entries(viMessages)) {
    assert.ok(value.trim(), key);
    const placeholders = (text) => [...text.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]).sort();
    assert.deepEqual(placeholders(value), placeholders(key), key);
  }
  const t = createTranslator("vi");
  assert.equal(t("View {v0}", { v0: "Oak chair <script>" }), "Xem Oak chair <script>");
  assert.equal(t("View {v0}"), "Xem {v0}");
  assert.equal(t("{constructor}", {}), "{constructor}");
  for (const key of ["constructor", "__proto__", "toString", "Untranslated editorial title"]) assert.equal(t(key), key);
  assert.equal(translate("en", "View {v0}", { v0: "Oak chair" }), "View Oak chair");
});

test("bounded validation messages translate without changing field contracts", () => {
  assert.equal(translate("vi", "Enter 1–120 characters."), "Nhập từ 1–120 ký tự.");
  assert.equal(translate("vi", "Enter at most 254 characters."), "Nhập tối đa 254 ký tự.");
  assert.equal(translate("en", "Enter 1–120 characters."), "Enter 1–120 characters.");
  assert.equal(translate("vi", "Enter 1–120 characters.<script>"), "Enter 1–120 characters.<script>");
});

test("validation messages shown by public and admin forms have Vietnamese translations", () => {
  const missing = [];
  for (const entry of readdirSync("lib/validation").filter((name) => name.endsWith(".ts"))) {
    const source = ts.createSourceFile(entry, readFileSync(path.join("lib/validation", entry), "utf8"), ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isStringLiteral(node) && /^[A-Z][a-z].*\.$/.test(node.text) && node.text.includes(" ") && !Object.hasOwn(viMessages, node.text)) missing.push(node.text);
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.deepEqual(missing, []);
  const { validateCustomerInquiryInput } = loadModule("lib/validation/inquiry.ts");
  const invalid = validateCustomerInquiryInput({ source: "contact", contact_name: "", contact_phone: "", contact_email: "not-an-email", message: "", items: [] });
  assert.equal(invalid.success, false);
  for (const message of [invalid.error, ...Object.values(invalid.fields)]) assert.notEqual(translate("vi", message), message);
});

test("server locale reads the cookie per request and never writes it", async () => {
  for (const cookie of [undefined, "en", "vi", "bad-value"]) {
    const requested = [];
    const server = loadModule("lib/i18n/server.ts", {
      "server-only": {},
      "next/headers": { cookies: async () => ({ get(name) { requested.push(name); return cookie === undefined ? undefined : { value: cookie }; } }) },
    });
    const state = await server.getI18n();
    assert.deepEqual(requested, [LOCALE_COOKIE]);
    assert.equal(state.locale, cookie === "vi" ? "vi" : "en");
    assert.equal(state.t("Language"), cookie === "vi" ? "Ngôn ngữ" : "Language");
  }
});

test("localized price display keeps the amount, currency and quote fallback", () => {
  const { formatCatalogPrice } = loadModule("lib/catalog/public.ts", {
    "server-only": {}, "@/lib/supabase/server": {},
  });
  assert.equal(formatCatalogPrice(1234.5, "USD"), new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(1234.5));
  assert.equal(formatCatalogPrice(1234.5, "USD", "vi-VN"), new Intl.NumberFormat("vi-VN", { style: "currency", currency: "USD" }).format(1234.5));
  assert.equal(translate("vi", formatCatalogPrice(null, "USD")), "Yêu cầu báo giá");
});

test("UI translation literals have Vietnamese entries and never translate identifiers or form values", () => {
  const failures = [];
  function inspect(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) { inspect(filename); continue; }
      if (!filename.endsWith(".tsx")) continue;
      const source = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node) {
        if (ts.isCallExpression(node) && node.expression.getText(source) === "t" && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
          if (!Object.hasOwn(viMessages, node.arguments[0].text)) failures.push(filename + ": missing " + node.arguments[0].text);
        }
        if (ts.isJsxAttribute(node) && ["key", "id", "name", "value", "defaultValue", "href", "action", "type", "className"].includes(node.name.getText(source))) {
          if (node.initializer && /\bt\(/.test(node.initializer.getText(source))) failures.push(filename + ": translated contract " + node.name.getText(source));
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  inspect("app"); inspect("components");
  assert.deepEqual(failures, []);
});
