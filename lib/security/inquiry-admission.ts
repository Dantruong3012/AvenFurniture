import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";

// Above the maximum validated 100-item inquiry, including multibyte text.
export const MAX_INQUIRY_BODY_BYTES = 256 * 1024;
export class InquiryBodyTooLarge extends Error {}

export async function readInquiryJson(request: Request): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > MAX_INQUIRY_BODY_BYTES) {
    await request.body?.cancel().catch(() => {});
    throw new InquiryBodyTooLarge();
  }
  if (!request.body) throw new SyntaxError("Missing JSON body");
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_INQUIRY_BODY_BYTES) throw new InquiryBodyTooLarge();
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;
const MAX_CLIENTS = 1024;
const salt = randomBytes(32);
const buckets = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: Request) {
  // Vercel overwrites this header. Outside Vercel, caller-supplied IP headers
  // are untrusted, so all requests share a conservative fallback bucket.
  const ip = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.trim() : undefined;
  if (!ip || !isIP(ip)) return "unknown";
  const canonical = isIP(ip) === 6 ? new URL(`http://[${ip}]`).hostname : ip;
  return createHmac("sha256", salt).update(canonical).digest("hex");
}

/** Per-process defense in depth; a Vercel WAF rule must enforce the shared limit. */
export function inquiryRetryAfter(request: Request, now = Date.now()): number {
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  const key = clientKey(request);
  const bucket = buckets.get(key);
  if (bucket) {
    if (bucket.count >= MAX_ATTEMPTS) return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    bucket.count++;
  } else {
    // Do not evict active buckets: IP rotation must not reset existing limits.
    if (buckets.size >= MAX_CLIENTS) return 60;
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
  }
  return 0;
}
