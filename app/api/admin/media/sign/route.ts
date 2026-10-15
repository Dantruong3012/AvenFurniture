import { adminRequest, json, readJson } from "@/lib/media/api";
import { createUploadIntent, IMAGE_MIMES, MAX_IMAGE_BYTES } from "@/lib/media/cloudinary";

export async function POST(request: Request) {
  const auth = await adminRequest(request, "media-sign", 60);
  if (auth.error) return auth.error;
  const input = await readJson(request, 2048);
  if (!input) return json({ error: "Invalid request." }, 400);
  if (typeof input.name !== "string" || input.name.length < 1 || input.name.length > 255 ||
      typeof input.mime !== "string" || !IMAGE_MIMES.has(input.mime) ||
      typeof input.bytes !== "number" || !Number.isSafeInteger(input.bytes) || input.bytes < 1 || input.bytes > MAX_IMAGE_BYTES) return json({ error: "Choose a JPEG, PNG, WebP or AVIF image up to 10 MB." }, 400);
  try { return json(createUploadIntent()); } catch { return json({ error: "Image upload is temporarily unavailable." }, 503); }
}
