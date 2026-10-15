import { adminRequest, json, readJson } from "@/lib/media/api";
import { validateUploadResponse, verifyCloudinaryResource } from "@/lib/media/cloudinary";
import { createServiceClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const auth = await adminRequest(request, "media-complete", 60);
  if (auth.error || !auth.user) return auth.error;
  const input = await readJson(request, 16384);
  if (!input || !input.upload || typeof input.upload !== "object" || Array.isArray(input.upload) || typeof input.alt !== "string" || input.alt.length > 500) return json({ error: "Invalid image details." }, 400);
  try {
    const verified = validateUploadResponse(input.upload);
    await verifyCloudinaryResource(verified.assetId, verified);
    const service = createServiceClient();
    const { data: existing, error: lookupError } = await service.from("media_assets").select("*").eq("cloudinary_asset_id", verified.assetId).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return json({ asset: existing });
    const { data, error } = await service.from("media_assets").insert({ cloudinary_asset_id: verified.assetId, public_id: verified.publicId, secure_url: verified.secureUrl, width: verified.width, height: verified.height, format: verified.format, bytes: verified.bytes, uploaded_by: auth.user.id, alt: input.alt.trim(), status: "ready" }).select("*").single();
    if (error?.code === "23505") {
      const { data: raced } = await service.from("media_assets").select("*").eq("cloudinary_asset_id", verified.assetId).maybeSingle();
      if (raced) return json({ asset: raced });
    }
    if (error || !data) throw error;
    return json({ asset: data }, 201);
  } catch { return json({ error: "Image verification or save failed. Retry completion." }, 422); }
}
