import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";
import { loadModule } from "./helpers/load-module.mjs";

const nativeRequire = createRequire(import.meta.url);
const id = "00000000-0000-4000-8000-000000000001";
const key = "00000000-0000-4000-8000-000000000002";
const item = { productId: id, productName: "Oak chair", productSlug: "oak-chair", quantity: 3, currency: "USD", unitPrice: null };
const contact = { contact_name: " Customer ", contact_phone: "+84 (90) 123-4567", contact_email: "customer@example.com", message: "  Delivery question\n", hp_company: "" };
const input = (overrides = {}) => ({ ...contact, source: "cart", items: [item], idempotency_key: key, ...overrides });
const confirmation = { success: true, id, reference: 42, is_duplicate: false };
const request = (body) => new Request("https://storefront.test/api/inquiries", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "Content-Type": "application/json" } });

// The actual route, validator, and repository execute; only the service client's
// RPC transport is replaced. No test can reach Supabase or another HTTP service.
function api({ fail = false } = {}) {
  const calls = [];
  const saved = new Set();
  const { POST } = loadModule("app/api/inquiries/route.ts", {
    "server-only": {},
    "@/lib/supabase/admin": { createServiceClient: () => ({ rpc: async (name, args) => {
      calls.push({ name, args });
      if (fail) throw new Error("private credentials and database stack");
      const is_duplicate = saved.has(args.p_idempotency_key);
      saved.add(args.p_idempotency_key);
      return { data: [{ id, reference: 42, is_duplicate }], error: null };
    } }) },
  });
  return { POST, calls, saved };
}

test("POST maps all storefront sources to validated atomic persistence and returns only confirmation fields", async () => {
  for (const source of ["cart", "product", "contact"]) {
    const { POST, calls } = api();
    const response = await POST(request(input({ source, items: source === "contact" ? [] : [item], status: "completed", assignee_id: id, original_submission: { injected: true } })));
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), confirmation);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, "submit_customer_inquiry");
    const args = calls[0].args;
    assert.equal(args.p_source, source);
    assert.equal(args.p_contact_name, "Customer");
    assert.equal(args.p_contact_phone, contact.contact_phone);
    assert.equal(args.p_message, contact.message);
    assert.equal(args.p_idempotency_key, key);
    assert.equal(args.p_original_submission.status, undefined);
    assert.equal(args.p_original_submission.original_submission, undefined);
    assert.equal(args.p_original_submission.hp_company, undefined);
    assert.deepEqual(args.p_items, source === "contact" ? [] : [{ product_id: id, product_name: item.productName, product_slug: item.productSlug, quantity: 3, currency: "USD", unit_price: null }]);
  }
});

test("POST returns 400 for malformed JSON, invalid contacts, bounds, snapshots, sources and honeypots without persistence", async () => {
  const { POST, calls } = api();
  for (const body of ["{", null, [], input({ contact_name: " " }), input({ contact_name: "x".repeat(121) }), input({ contact_phone: "not a phone" }), input({ contact_email: "invalid@" }), input({ message: "x".repeat(10001) }), input({ idempotency_key: "bad" }), input({ source: "manual" }), input({ source: "unknown" }), input({ items: [] }), input({ source: "product", items: [item, item] }), input({ items: [{ ...item, quantity: 1000 }] }), input({ items: [{ ...item, unitPrice: -1 }] }), input({ items: [{ ...item, productId: "bad" }] }), ...["Bot Ltd", " ", null, 0, {}].map((hp_company) => input({ hp_company }))]) {
    const response = await POST(request(body));
    assert.equal(response.status, 400, JSON.stringify(body));
    const data = await response.json();
    assert.equal(data.success, false);
    assert.equal(typeof data.error, "string");
    assert.equal(typeof data.fields, "object");
  }
  const invalid = await (await POST(request(input({ contact_phone: "bad", contact_email: "bad" })))).json();
  assert.ok(invalid.fields.contact_phone);
  assert.ok(invalid.fields.contact_email);
  assert.equal(calls.length, 0);
});

test("POST accepts boundary contacts, optional email, zero price and preserves duplicate submission keys", async () => {
  const { POST, calls, saved } = api();
  const body = input({ contact_name: "x".repeat(120), contact_email: "", message: "x".repeat(10000), items: [{ ...item, unitPrice: 0, quantity: 999 }] });
  const first = await POST(request(body));
  const retry = await POST(request(body));
  assert.equal(first.status, 201);
  assert.equal(retry.status, 201);
  assert.deepEqual(await first.json(), confirmation);
  assert.deepEqual(await retry.json(), { ...confirmation, is_duplicate: true });
  assert.equal(calls[0].args.p_contact_email, null);
  assert.equal(saved.size, 1);
  assert.equal(calls[0].args.p_idempotency_key, calls[1].args.p_idempotency_key);
});

test("POST sanitizes internal exceptions", async () => {
  const response = await api({ fail: true }).POST(request(input()));
  assert.equal(response.status, 500);
  const data = await response.json();
  assert.equal(data.success, false);
  assert.match(data.error, /retry/i);
  assert.doesNotMatch(JSON.stringify(data), /credentials|database|stack|SUPABASE/);
});

// A small hook harness exercises actual TSX event handlers and element props.
// Browser layout/focus trapping are native dialog behavior, not simulated here.
function componentHarness(filename, overrides = {}, globals = {}) {
  const slots = [];
  const effects = [];
  let cursor = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useId() { cursor++; return "inquiry-test"; },
    useEffect(effect) { cursor++; effects.push(effect); },
  };
  const javascript = ts.transpileModule(readFileSync(new URL(`../${filename}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  const require = (name) => {
    if (name === "react") return react;
    if (name in overrides) return overrides[name];
    if (name.startsWith("@/")) return loadModule(`${name.slice(2)}.ts`);
    return nativeRequire(name);
  };
  new Function("require", "module", "exports", ...Object.keys(globals), javascript)(require, loaded, loaded.exports, ...Object.values(globals));
  return { exports: loaded.exports, effects, render(name, props = {}) { cursor = 0; effects.length = 0; return loaded.exports[name](props); } };
}
function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap((node) => nodes(node, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
const find = (tree, predicate) => { const found = nodes(tree, predicate)[0]; assert.ok(found, "Expected element"); return found; };
function formHarness(fetch, props = {}) {
  const harness = componentHarness("components/forms/contact-form.tsx", {}, {
    fetch,
    FormData: class { constructor(values) { this.values = values; } get(name) { return this.values[name] ?? null; } },
  });
  return {
    ...harness,
    tree: () => harness.render("ContactForm", props),
    submit(values = contact) {
      const tree = harness.render("ContactForm", props);
      return tree.props.onSubmit({ preventDefault() {}, currentTarget: values });
    },
  };
}

test("form validates contacts/honeypot locally and associates errors with labeled fields", async () => {
  const form = formHarness(() => { assert.fail("Invalid input must not send HTTP"); });
  await form.submit({ ...contact, contact_phone: "bad", contact_email: "bad" });
  let tree = form.tree();
  assert.ok(find(tree, (node) => node.props.role === "alert"));
  for (const name of ["contact_phone", "contact_email"]) {
    const field = find(tree, (node) => node.props.name === name);
    assert.equal(field.props["aria-invalid"], true);
    assert.ok(find(tree, (node) => node.props.id === field.props["aria-describedby"]));
    assert.ok(find(tree, (node) => node.type === "label" && node.props.htmlFor === field.props.id));
  }
  await form.submit({ ...contact, hp_company: "Spam" });
  tree = form.tree();
  assert.ok(find(tree, (node) => node.props.role === "alert"));
  assert.equal(find(tree, (node) => node.props.name === "hp_company").props.tabIndex, -1);
});

test("form blocks double clicks, keeps key/payload on uncertain retries, confirms duplicates and clears only on success", async () => {
  const bodies = [];
  let release;
  let clearCount = 0;
  const pending = [];
  const form = formHarness(async (url, options) => {
    assert.equal(url, "/api/inquiries");
    assert.equal(options.method, "POST");
    bodies.push(JSON.parse(options.body));
    if (bodies.length === 1) return new Promise((resolve) => { release = resolve; });
    return Response.json({ ...confirmation, is_duplicate: true }, { status: 201 });
  }, { source: "cart", items: [item], onSuccess: () => clearCount++, onPendingChange: (value) => pending.push(value) });
  const first = form.submit();
  assert.equal(find(form.tree(), (node) => node.type === "fieldset").props.disabled, true);
  await form.submit();
  assert.equal(bodies.length, 1);
  release(Response.json({ error: "private service error" }, { status: 500 }));
  await first;
  assert.equal(clearCount, 0);
  assert.doesNotMatch(JSON.stringify(form.tree()), /private service error/);
  await form.submit();
  assert.deepEqual(bodies[0], bodies[1]);
  assert.deepEqual(bodies[0].items, [item]);
  assert.equal(bodies[0].source, "cart");
  assert.match(bodies[0].idempotency_key, /^[0-9a-f-]{36}$/);
  assert.equal(clearCount, 1);
  assert.deepEqual(pending, [true, false, true, false]);
  const status = find(form.tree(), (node) => node.props.role === "status");
  assert.match(JSON.stringify(status), /42/);
  assert.equal(nodes(form.tree(), (node) => node.type === "form").length, 0);
});

test("network and malformed response failures preserve form; edited requests get new keys; server field errors are accessible", async () => {
  const bodies = [];
  let count = 0;
  const form = formHarness(async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    count++;
    if (count === 1) throw new TypeError("offline");
    if (count === 2) return new Response("<html>unavailable</html>", { status: 502 });
    return Response.json({ success: false, error: "Check your phone.", fields: { contact_phone: "Enter a valid phone number." } }, { status: 400 });
  });
  await form.submit();
  await form.submit();
  assert.equal(bodies[0].idempotency_key, bodies[1].idempotency_key);
  await form.submit({ ...contact, message: "Changed question" });
  assert.notEqual(bodies[1].idempotency_key, bodies[2].idempotency_key);
  assert.equal(bodies[2].source, "contact");
  assert.deepEqual(bodies[2].items, []);
  assert.equal(find(form.tree(), (node) => node.props.name === "contact_phone").props["aria-invalid"], true);
});

const formComponents = { ContactForm: "ContactForm", InquiryDialog: "InquiryDialog" };
test("product and quote modals pass exact snapshot fields to the shared form", () => {
  const product = { id, name: item.productName, slug: item.productSlug, currency: "USD", price: null };
  const productModal = componentHarness("components/product/product-inquiry-modal.tsx", { "@/components/forms/contact-form": formComponents });
  const tree = productModal.render("ProductInquiryModal", { product, quantity: 3, open: true, onClose() {} });
  const form = find(tree, (node) => node.type === "ContactForm");
  assert.equal(form.props.source, "product");
  assert.deepEqual(form.props.items, [item]);
  const quoteModal = componentHarness("components/cart/quote-request-modal.tsx", { "@/components/forms/contact-form": formComponents });
  const clear = () => {};
  const quote = quoteModal.render("QuoteRequestModal", { items: [item], open: true, onSuccess: clear, onClose() {} });
  const quoteForm = find(quote, (node) => node.type === "ContactForm");
  assert.equal(quoteForm.props.source, "cart");
  assert.deepEqual(quoteForm.props.items, [item]);
  assert.equal(quoteForm.props.onSuccess, clear);
});

test("cart disallows unavailable items, captures quantities and keeps confirmation mounted after clearing", () => {
  const product = { id, name: item.productName, slug: item.productSlug, currency: "USD", price: null, category: { name: "Chairs" }, images: [] };
  const store = { cart: [{ productId: id, quantity: 3 }], hydrated: true, clearCart() { store.cart = []; } };
  const resolved = { products: [], loading: false, error: "" };
  const harness = componentHarness("app/cart/page.tsx", {
    "next/image": { default: "Image" }, "next/link": { default: "Link" },
    "@/components/cart/quote-request-modal": { QuoteRequestModal: "QuoteRequestModal" },
    "@/components/store/store-provider": { useStore: () => store },
    "@/components/ui/button": { ButtonLink: "ButtonLink" },
    "@/components/ui/icons": { MinusIcon: "MinusIcon", PlusIcon: "PlusIcon", TrashIcon: "TrashIcon" },
    "@/lib/catalog/use-resolved-products": { useResolvedProducts: () => resolved },
  });
  const trigger = (tree) => find(tree, (node) => node.type === "button" && node.props.children === "Request a quote");
  assert.equal(trigger(harness.render("default")).props.disabled, true);
  resolved.products = [product];
  trigger(harness.render("default")).props.onClick();
  let modal = find(harness.render("default"), (node) => node.type === "QuoteRequestModal");
  assert.deepEqual(modal.props.items, [item]);
  assert.equal(store.cart.length, 1);
  modal.props.onSuccess();
  assert.equal(store.cart.length, 0);
  modal = find(harness.render("default"), (node) => node.type === "QuoteRequestModal");
  assert.equal(modal.props.open, true);
  assert.deepEqual(modal.props.items, [item]);
});

test("contact quote referral adapts context while keeping a general inquiry form", async () => {
  const harness = componentHarness("app/contact/page.tsx", { "next/link": { default: "Link" }, "@/components/forms/contact-form": formComponents });
  const quote = await harness.render("default", { searchParams: Promise.resolve({ source: "quote" }) });
  assert.match(JSON.stringify(quote), /Your quote list/);
  assert.ok(find(quote, (node) => node.type === "Link" && node.props.href === "/cart"));
  assert.ok(find(quote, (node) => node.type === "ContactForm"));
  const general = await harness.render("default", { searchParams: Promise.resolve({}) });
  assert.match(JSON.stringify(general), /Contact the studio/);
});

test("dialog opens modally, focuses the first field, restores trigger and handles Escape except while submitting", () => {
  let focused = 0, opened = 0, closed = 0, restored = 0, cancelled = 0;
  class Element { isConnected = true; focus() { restored++; } }
  const harness = componentHarness("components/forms/contact-form.tsx", {}, { document: { activeElement: new Element() }, HTMLElement: Element });
  const props = { open: true, title: "Request a quote", onClose: () => cancelled++ };
  let dialog = harness.render("InquiryDialog", props);
  assert.equal(dialog.type, "dialog");
  assert.ok(find(dialog, (node) => node.props.id === dialog.props["aria-labelledby"]));
  dialog.props.ref.current = { showModal() { opened++; }, close() { closed++; }, querySelector() { return { focus() { focused++; } }; } };
  const cleanup = harness.effects[0]();
  assert.equal(opened, 1); assert.equal(focused, 1);
  dialog.props.onCancel({ preventDefault() {} });
  assert.equal(cancelled, 1);
  cleanup();
  assert.equal(closed, 1); assert.equal(restored, 1);
  dialog = harness.render("InquiryDialog", { ...props, pending: true });
  dialog.props.onCancel({ preventDefault() {} });
  assert.equal(cancelled, 1);
  assert.equal(find(dialog, (node) => node.type === "button").props.disabled, true);
});

test("closing a successful cart dialog focuses the heading when its original trigger was removed", () => {
  const events = [];
  class Element { isConnected = false; focus() { assert.fail("Detached trigger must not be focused"); } }
  const harness = componentHarness("components/forms/contact-form.tsx", {}, { document: { activeElement: new Element() }, HTMLElement: Element });
  const dialog = harness.render("InquiryDialog", { open: true, title: "Request a quote", onClose() {}, returnFocusRef: { current: { focus() { events.push("focus heading"); } } } });
  dialog.props.ref.current = { showModal() {}, close() { events.push("close dialog"); }, querySelector() { return null; } };
  harness.effects[0]()();
  assert.deepEqual(events, ["close dialog", "focus heading"]);
});

test("customer lookup validation accepts normalized email and exact-format phone only", () => {
  const { validateCustomerInquiryLookup } = loadModule("lib/validation/inquiry.ts");
  assert.deepEqual(validateCustomerInquiryLookup({ type: "email", value: " Customer@Example.com " }), { type: "email", value: "customer@example.com" });
  assert.deepEqual(validateCustomerInquiryLookup({ type: "phone", value: "+84 (90) 123-4567" }), { type: "phone", value: "+84 (90) 123-4567" });
  for (const value of [
    { type: "email", value: "bad@" }, { type: "email", value: "a%@example.com" },
    { type: "phone", value: "123" }, { type: "phone", value: "90@example.com" },
    { type: "email", value: "a@example.com\u0000" }, { type: "unknown", value: "a@example.com" }, null,
  ]) assert.equal(validateCustomerInquiryLookup(value), null);
});

test("customer repository performs an exact contact lookup, omits deleted rows and returns bounded customer fields", async () => {
  const calls = [];
  const record = { reference: 42, created_at: "2025-01-01T00:00:00Z", status: "new", message: "Need a chair", inquiry_items: [] };
  const builder = {
    select(value) { calls.push(["select", value]); return this; },
    is(...args) { calls.push(["is", ...args]); return this; },
    ilike(...args) { calls.push(["ilike", ...args]); return this; },
    eq(...args) { calls.push(["eq", ...args]); return this; },
    order(...args) { calls.push(["order", ...args]); return this; },
    limit(...args) { calls.push(["limit", ...args]); return this; },
    then(resolve) { return resolve({ data: [record], error: null }); },
  };
  const { lookupCustomerInquiries } = loadModule("lib/repositories/supabaseInquiryRepository.ts", {
    "server-only": {}, "@/lib/supabase/admin": { createServiceClient: () => ({ from: (table) => { calls.push(["from", table]); return builder; } }) },
  });
  const results = await lookupCustomerInquiries({ type: "email", value: "customer@example.com" });
  assert.deepEqual(results, [record]);
  assert.ok(calls.some(([method, ...args]) => method === "ilike" && args[0] === "contact_email" && args[1] === '"customer@example.com"'));
  assert.ok(calls.some(([method, ...args]) => method === "is" && args[0] === "deleted_at" && args[1] === null));
  assert.ok(calls.some(([method, ...args]) => method === "limit" && args[0] === 50));
  const projection = calls.find(([method]) => method === "select")[1];
  assert.match(projection, /inquiry_items\(id,product_name,product_slug,quantity,unit_price,currency\)/);
  assert.doesNotMatch(projection, /contact_email|contact_phone|assignee_id|inquiry_notes/);
});

test("customer lookup action rate-limits by normalized identifier and returns only generic empty-result feedback", async () => {
  const lookups = [], limits = [];
  let permit = true;
  const { lookupCustomerInquiries } = loadModule("lib/inquiries/actions.ts", {
    "next/cache": { revalidatePath() {} },
    "@/lib/auth/admin": { requireAdmin() { assert.fail("Public lookup must not require admin auth"); } },
    "@/lib/auth/mutation": { allowAuthMutation: async (...args) => { limits.push(args); return permit; } },
    "@/lib/repositories/supabaseInquiryRepository": {
      addAdminInquiryNote() {}, updateAdminInquiryStatus() {},
      lookupCustomerInquiries: async (identifier) => { lookups.push(identifier); return []; },
    },
  });
  const result = await lookupCustomerInquiries({}, { get(name) { return ({ type: "email", value: "Customer@Example.com" })[name] ?? null; } });
  assert.equal(result.message, "No matching inquiries found. Check the contact detail and try again.");
  assert.deepEqual(result.inquiries, []);
  assert.deepEqual(limits[0], ["customer-inquiry-lookup", "customer@example.com", 5]);
  assert.deepEqual(lookups[0], { type: "email", value: "customer@example.com" });
  permit = false;
  const denied = await lookupCustomerInquiries({}, { get(name) { return ({ type: "phone", value: "+84 90 1234567" })[name] ?? null; } });
  assert.match(denied.error, /too many/i);
});
