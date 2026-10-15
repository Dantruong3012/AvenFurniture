import { adminRequest, json, readJson } from "@/lib/media/api";
import { destroyCloudinaryImage } from "@/lib/media/cloudinary";
import { createServiceClient } from "@/lib/supabase/admin";
import { uuidPattern } from "@/lib/validation/catalog";

type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  const auth = await adminRequest(request, "media-alt", 120);
  if (auth.error) return auth.error;
  const { id } = await context.params;
  if (!uuidPattern.test(id)) return json({ error: "Invalid image ID." }, 400);
  const input = await readJson(request, 2048);
  if (!input || typeof input.alt !== "string" || input.alt.length > 500) return json({ error: "Alt text must be 500 characters or less." }, 400);
  const service = createServiceClient();
  const { data, error } = await service.from("media_assets").update({ alt: input.alt.trim() }).eq("id", id).eq("status", "ready").select("*").maybeSingle();
  if (error) return json({ error: "Alt text could not be changed; published images require alt text." }, 409);
  return data ? json({ asset: data }) : json({ error: "Image unavailable." }, 404);
}

export async function DELETE(request: Request, context: Context) {
  const auth = await adminRequest(request, "media-delete", 30);
  if (auth.error || !auth.supabase) return auth.error;
  const { id } = await context.params;
  if (!uuidPattern.test(id)) return json({ error: "Invalid image ID." }, 400);
  const { data: claimed, error: claimError } = await auth.supabase.rpc("claim_unused_media", { p_id: id });
  if (claimError) return json({ error: claimError.code === "23503" ? "Image is still used by a product." : "Image could not be claimed for deletion." }, 409);
  if (!claimed) return json({ error: "Image not found." }, 404);
  const service = createServiceClient();
  const { data: asset } = await service.from("media_assets").select("public_id").eq("id", id).eq("status", "deleting").maybeSingle();
  if (!asset) return json({ error: "Image deletion state changed. Retry later." }, 409);
  try {
    await destroyCloudinaryImage(asset.public_id);
    const result = await service.from("media_assets").delete().eq("id", id).eq("status", "deleting");
    if (result.error) throw result.error;
    return json({ deleted: true });
  } catch {
    await service.from("media_assets").update({ status: "delete_failed" }).eq("id", id).eq("status", "deleting");
    return json({ error: "Deletion could not be confirmed. Retry from the media library." }, 503);
  }
}
