import { requireAdmin } from "@/lib/auth/admin";
import { MediaLibrary } from "@/components/admin/media-library";

export default async function MediaPage() {
  const { supabase } = await requireAdmin();
  const initial = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase.from("media_assets").select("*, product_images(id)").order("created_at", { ascending: false }).order("id").range(start, start + 999);
    if (error) throw new Error("Media library could not be loaded.");
    initial.push(...(data || []).map(({ product_images, ...asset }) => ({ ...asset, usage: product_images.length })));
    if (!data || data.length < 1000) break;
  }
  return <div className="admin-content"><header className="admin-header"><div><p className="section-note">Catalog management</p><h1>Media library</h1><p>Upload product photos once, add alt text, then choose them while editing products. An image can be reused; only unused images can be deleted.</p><p className="field-hint">Alt text briefly describes what the image shows for accessibility and search. Every image needs it before its product is published.</p></div></header><MediaLibrary initial={initial}/></div>;
}
