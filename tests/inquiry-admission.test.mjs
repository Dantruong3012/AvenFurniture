import assert from "node:assert/strict";
import { test } from "node:test";
import { loadModule } from "./helpers/load-module.mjs";

const guard = () => loadModule("lib/security/inquiry-admission.ts", { "server-only": {} });
const encoder = new TextEncoder();
const request = (body, headers = {}) => new Request("https://storefront.test/api/inquiries", { method: "POST", body, headers, ...(body instanceof ReadableStream ? { duplex: "half" } : {}) });

test("body cap rejects declared oversize before reading and cancels the stream", async () => {
  const { readInquiryJson, InquiryBodyTooLarge, MAX_INQUIRY_BODY_BYTES: max } = guard();
  let reads = 0, cancelled = false;
  const body = new ReadableStream({ pull() { reads++; }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
  await assert.rejects(readInquiryJson(request(body, { "content-length": String(max + 1) })), InquiryBodyTooLarge);
  assert.equal(reads, 0);
  assert.equal(cancelled, true);
});

test("streamed byte cap catches missing and false Content-Length and stops consuming", async () => {
  for (const length of [undefined, "1"]) {
    const { readInquiryJson, InquiryBodyTooLarge, MAX_INQUIRY_BODY_BYTES: max } = guard();
    let reads = 0, cancelled = false;
    const body = new ReadableStream({ pull(controller) { reads++; controller.enqueue(new Uint8Array(max / 2)); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
    await assert.rejects(readInquiryJson(request(body, length ? { "content-length": length } : {})), InquiryBodyTooLarge);
    assert.equal(reads, 3);
    assert.equal(cancelled, true);
    assert.equal(body.locked, false);
  }
});

test("body cap counts UTF-8 bytes, accepts its exact boundary and split multibyte characters", async () => {
  const { readInquiryJson, InquiryBodyTooLarge, MAX_INQUIRY_BODY_BYTES: max } = guard();
  assert.equal(await readInquiryJson(request(JSON.stringify("a".repeat(max - 2)))), "a".repeat(max - 2));
  await assert.rejects(readInquiryJson(request(JSON.stringify("界".repeat(max / 3)))), InquiryBodyTooLarge);
  const bytes = encoder.encode(JSON.stringify({ text: "Nội thất 🪑" }));
  const body = new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });
  assert.deepEqual(await readInquiryJson(request(body)), { text: "Nội thất 🪑" });
});

test("malformed JSON, invalid UTF-8, absent and interrupted streams fail closed", async () => {
  const { readInquiryJson } = guard();
  for (const body of ["{", "", new Uint8Array([0xff])]) await assert.rejects(readInquiryJson(request(body)));
  await assert.rejects(readInquiryJson(new Request("https://storefront.test")));
  const body = new ReadableStream({ pull(controller) { controller.error(new Error("connection lost")); } });
  await assert.rejects(readInquiryJson(request(body)), /connection lost/);
  assert.equal(body.locked, false);
});

function onVercel(value, run) {
  const previous = process.env.VERCEL;
  try { if (value === undefined) delete process.env.VERCEL; else process.env.VERCEL = value; run(); }
  finally { if (previous === undefined) delete process.env.VERCEL; else process.env.VERCEL = previous; }
}
const from = (ip, headers = {}) => request("{}", { "x-vercel-forwarded-for": ip, ...headers });

test("local limiter shares an untrusted-header fallback and resets after one minute", () => onVercel(undefined, () => {
  const { inquiryRetryAfter } = guard();
  for (let i = 0; i < 10; i++) assert.equal(inquiryRetryAfter(from(`192.0.2.${i}`, { "x-forwarded-for": `198.51.100.${i}` }), 1000), 0);
  assert.equal(inquiryRetryAfter(from("203.0.113.1"), 1500), 60);
  assert.equal(inquiryRetryAfter(from("203.0.113.2"), 60001), 1);
  assert.equal(inquiryRetryAfter(from("203.0.113.3"), 61000), 0);
}));

test("Vercel clients have separate limits and forged alternate headers cannot reset them", () => onVercel("1", () => {
  const { inquiryRetryAfter } = guard();
  for (let i = 0; i < 10; i++) assert.equal(inquiryRetryAfter(from("192.0.2.1", { "x-forwarded-for": `198.51.100.${i}` }), 0), 0);
  assert.equal(inquiryRetryAfter(from("192.0.2.1"), 0), 60);
  assert.equal(inquiryRetryAfter(from("192.0.2.2"), 0), 0);
  for (let i = 0; i < 10; i++) assert.equal(inquiryRetryAfter(from("2001:db8::1"), 0), 0);
  assert.equal(inquiryRetryAfter(from("2001:0db8:0:0:0:0:0:1"), 0), 60);
}));

test("invalid/missing Vercel IPs share fallback; bounded storage rejects rotation without evicting active limits", () => onVercel("1", () => {
  const { inquiryRetryAfter } = guard();
  for (let i = 0; i < 10; i++) assert.equal(inquiryRetryAfter(from(i % 2 ? "" : "192.0.2.1, 192.0.2.2"), 0), 0);
  assert.equal(inquiryRetryAfter(from("invalid"), 0), 60);
  for (let i = 0; i < 1023; i++) assert.equal(inquiryRetryAfter(from(`2001:db8::${(i + 1).toString(16)}`), 0), 0);
  assert.equal(inquiryRetryAfter(from("198.51.100.1"), 0), 60);
  assert.equal(inquiryRetryAfter(from("invalid"), 0), 60);
  assert.equal(inquiryRetryAfter(from("198.51.100.1"), 60000), 0);
}));
