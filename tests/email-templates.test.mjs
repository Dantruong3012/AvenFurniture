import assert from "node:assert/strict";
import { test } from "node:test";
import { loadModule } from "./helpers/load-module.mjs";

const { renderCustomerConfirmation, renderConsultantAssignment, renderStatusUpdate, renderEmailTemplate } = loadModule("lib/email/templates.ts");

test("customer confirmation renders greeting and itemized request in text and HTML", () => {
  const result = renderCustomerConfirmation({ to: "customer@example.com", customerName: "Ari <Admin>", reference: 42,
    items: [{ name: "Oak & Ash", quantity: 2, unitPrice: 12.5, currency: "USD" }] });
  assert.equal(result.to, "customer@example.com");
  assert.match(result.text, /Hello Ari <Admin>/);
  assert.match(result.text, /2 × Oak & Ash — USD 12.50/);
  assert.match(result.html, /Ari &lt;Admin&gt;/);
  assert.match(result.html, /Oak &amp; Ash/);
});

test("consultant assignment includes contact details, notes and an escaped admin link", () => {
  const result = renderConsultantAssignment({ to: "consultant@example.com", inquiryId: "abc-123", customerName: "Ari",
    customerEmail: "ari@example.com", customerPhone: "+1 555 0100", notes: "Please call <soon>", adminUrl: "https://admin.example.com/inquiries/abc-123?a=1&b=2" });
  assert.match(result.text, /Inquiry abc-123/);
  assert.match(result.text, /ari@example.com/);
  assert.match(result.text, /Please call <soon>/);
  assert.match(result.html, /&lt;soon&gt;/);
  assert.match(result.html, /&amp;b=2/);
  assert.throws(() => renderConsultantAssignment({ to: "x@example.com", inquiryId: "1", customerName: "X", adminUrl: "javascript:alert(1)" }));
});

test("status updates address customer or staff and show transition", () => {
  const customer = renderStatusUpdate({ to: "customer@example.com", recipient: "customer", inquiryId: "abc", customerName: "Ari", previousStatus: "in_review", status: "quoted", reference: 42 });
  assert.match(customer.text, /Hello Ari/);
  assert.match(customer.text, /changed from in review to quoted/);
  const staff = renderEmailTemplate({ template: "status_update", data: { to: "staff@example.com", recipient: "staff", inquiryId: "abc", customerName: "Ari", status: "closed" } });
  assert.match(staff.text, /Inquiry abc update/);
  assert.match(staff.subject, /closed/);
});

test("template inputs reject unsafe envelope fields and malformed items", () => {
  assert.throws(() => renderCustomerConfirmation({ to: "bad\n@example.com", customerName: "Ari" }));
  assert.throws(() => renderCustomerConfirmation({ to: "a@example.com", customerName: "Ari", items: [{ name: "Chair", quantity: 0 }] }));
  assert.throws(() => renderStatusUpdate({ to: "a@example.com", recipient: "customer", inquiryId: "x", customerName: "Ari", status: "new\nBcc: x" }));
});
