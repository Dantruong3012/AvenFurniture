import "server-only";
import { createHash, timingSafeEqual, randomUUID } from "node:crypto";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
export const IMAGE_FORMATS = new Set(["jpg", "jpeg", "png", "webp", "avif"]);
const prefix = "avenfurniture/catalog/";

function config() {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud || !key || !secret || !/^[a-zA-Z0-9_-]+$/.test(cloud)) throw new Error("Cloudinary is not configured.");
  return { cloud, key, secret };
}
export function cloudName() { return config().cloud; }
function digest(value: string, secret: string) { return createHash("sha1").update(value + secret).digest("hex"); }
export function signParams(params: Record<string, string>, secret: string) {
  return digest(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("&"), secret);
}
export function createUploadIntent() {
  const { cloud, key, secret } = config();
  const params = { allowed_formats: "jpg,png,webp,avif", overwrite: "false", public_id: `${prefix}${randomUUID()}`, timestamp: String(Math.floor(Date.now() / 1000)) };
  return { uploadUrl: `https://api.cloudinary.com/v1_1/${cloud}/image/upload`, cloudName: cloud, apiKey: key, params, signature: signParams(params, secret) };
}

type UploadResponse = { asset_id?: unknown; public_id?: unknown; version?: unknown; signature?: unknown; resource_type?: unknown; type?: unknown; format?: unknown; bytes?: unknown; width?: unknown; height?: unknown; secure_url?: unknown };
export function validateUploadResponse(input: UploadResponse) {
  const { cloud, secret } = config();
  const { asset_id, public_id, version, signature, resource_type, type, format, bytes, width, height, secure_url } = input;
  if (typeof asset_id !== "string" || !/^[a-zA-Z0-9_-]{10,100}$/.test(asset_id) ||
      typeof public_id !== "string" || !new RegExp(`^${prefix}[0-9a-f-]{36}$`).test(public_id) ||
      typeof version !== "number" || !Number.isSafeInteger(version) || typeof signature !== "string" || !/^[a-f0-9]{40}$/.test(signature)) throw new Error("Invalid upload response.");
  const expected = digest(`public_id=${public_id}&version=${version}`, secret);
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) throw new Error("Invalid upload response.");
  if (resource_type !== "image" || type !== "upload" || typeof format !== "string" || !IMAGE_FORMATS.has(format) ||
      typeof bytes !== "number" || !Number.isSafeInteger(bytes) || bytes < 1 || bytes > MAX_IMAGE_BYTES ||
      typeof width !== "number" || !Number.isSafeInteger(width) || width < 1 ||
      typeof height !== "number" || !Number.isSafeInteger(height) || height < 1 || typeof secure_url !== "string") throw new Error("Invalid image metadata.");
  const url = new URL(secure_url);
  if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || !url.pathname.startsWith(`/${cloud}/image/upload/`) || url.search || url.hash || !url.pathname.includes(public_id)) throw new Error("Invalid image URL.");
  return { assetId: asset_id, publicId: public_id, format, bytes, width, height, secureUrl: secure_url };
}

export async function verifyCloudinaryResource(assetId: string, expected: ReturnType<typeof validateUploadResponse>) {
  const { cloud, key, secret } = config();
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/resources/${encodeURIComponent(assetId)}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}` }, cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Cloudinary resource could not be verified.");
  const data: Record<string, unknown> = await response.json();
  if (data.asset_id !== expected.assetId || data.public_id !== expected.publicId || data.resource_type !== "image" || data.type !== "upload" ||
      data.format !== expected.format || data.bytes !== expected.bytes || data.width !== expected.width || data.height !== expected.height || data.secure_url !== expected.secureUrl) throw new Error("Cloudinary resource mismatch.");
}

export async function destroyCloudinaryImage(publicId: string) {
  if (!new RegExp(`^${prefix}[0-9a-f-]{36}$`).test(publicId)) throw new Error("Invalid image identifier.");
  const { cloud, key, secret } = config();
  const params = { invalidate: "true", public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)) };
  const body = new URLSearchParams({ ...params, api_key: key, signature: signParams(params, secret) });
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/destroy`, { method: "POST", body, cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Cloudinary deletion failed.");
  const result: { result?: string } = await response.json();
  if (result.result !== "ok" && result.result !== "not found") throw new Error("Cloudinary deletion was not confirmed.");
}
