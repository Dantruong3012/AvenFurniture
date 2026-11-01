"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { allowAuthMutation } from "@/lib/auth/mutation";
import { catalogError, uuidPattern, validateCatalog, type CatalogKind, type CatalogState } from "@/lib/validation/catalog";

async function save(kind: CatalogKind, form: FormData): Promise<CatalogState> {
  const { supabase, user } = await requireAdmin(kind === "categories" ? "super_admin" : undefined);
  const parsed = validateCatalog(kind, form);
  parsed.values.asset_ids = typeof form.get("asset_ids") === "string" ? String(form.get("asset_ids")) : "";
  const failure = (error: string): CatalogState => ({ error, values: parsed.values, fields: parsed.fields });
  if (!(await allowAuthMutation("catalog-save", user.id, 120))) return failure("Request denied or too many changes. Wait and retry from this site.");
  if (Object.keys(parsed.fields).length) return failure("Please correct the fields below.");
  const id = form.get("id");
  if (typeof id !== "string" || (id && !uuidPattern.test(id))) return failure("Invalid record ID.");
  try {
    if (kind === "categories") {
      const candidate = parsed.data;
      if (candidate.sort_order === undefined || candidate.active === undefined) return failure("Invalid category.");
      const data = { name: candidate.name, slug: candidate.slug, description: candidate.description, sort_order: candidate.sort_order, active: candidate.active };
      let result;
      if (id) {
        const updated = form.get("updated_at");
        if (typeof updated !== "string" || !Number.isFinite(Date.parse(updated))) return failure("Reload this category before saving.");
        result = await supabase.from("categories").update(data).eq("id", id).eq("updated_at", updated).select("id").maybeSingle();
      } else result = await supabase.from("categories").insert(data).select("id").single();
      if (result.error) return failure(catalogError(result.error.code));
      if (!result.data) return failure(catalogError("40001"));
    } else {
      const version = Number(form.get("version"));
      if (id && (!Number.isSafeInteger(version) || version < 1)) return failure("Reload this product before saving.");
      const rawAssets = form.get("asset_ids");
      const asset_ids = typeof rawAssets === "string" ? rawAssets.split(/[\s,]+/).filter(Boolean) : [];
      parsed.values.asset_ids = typeof rawAssets === "string" ? rawAssets : "";
      if (asset_ids.length > 20 || new Set(asset_ids).size !== asset_ids.length || asset_ids.some((id) => !uuidPattern.test(id))) return failure("Select up to 20 different media assets.");
      if (parsed.data.status === "published" && asset_ids.length === 0) return failure("Add a primary image before publishing.");
      if (asset_ids.length) {
        const { data: selected, error: mediaError } = await supabase.from("media_assets").select("id,alt,status").in("id", asset_ids);
        if (mediaError || !selected || selected.length !== asset_ids.length || selected.some((asset) => asset.status !== "ready")) return failure("Select only ready images from the media library.");
        if (parsed.data.status === "published" && selected.some((asset) => !asset.alt.trim())) return failure("Add alt text to every image before publishing.");
      }
      const result = await supabase.rpc("save_catalog_product", { p_id: id || null, p_expected_version: id ? version : null, p_data: parsed.data, p_asset_ids: asset_ids });
      if (result.error) return failure(catalogError(result.error.code));
    }
  } catch { return failure(catalogError()); }
  revalidatePath("/admin", "layout");
  if (kind === "products") {
    revalidatePath("/collections");
    revalidatePath("/products");
  }
  redirect(`/admin/${kind}?saved=1`);
}
export async function saveCategory(_previous: CatalogState, form: FormData) { return save("categories", form); }
export async function saveProduct(_previous: CatalogState, form: FormData) { return save("products", form); }

export async function deleteCatalog(_previous: CatalogState, form: FormData): Promise<CatalogState> {
  const kind = form.get("kind");
  if (kind !== "categories" && kind !== "products") return { error: "Invalid record type." };
  const { supabase, user } = await requireAdmin(kind === "categories" ? "super_admin" : undefined);
  if (!(await allowAuthMutation("catalog-delete", user.id, 60))) return { error: "Request denied. Wait and retry from this site." };
  const id = form.get("id");
  if (typeof id !== "string" || !uuidPattern.test(id) || form.get("confirmed") !== "on") return { error: "Confirm deletion first." };
  try {
    let result;
    if (kind === "products") {
      const version = Number(form.get("version"));
      if (!Number.isSafeInteger(version) || version < 1) return { error: "Reload the product first." };
      result = await supabase.from("products").delete().eq("id", id).eq("version", version).select("id").maybeSingle();
    } else {
      const updated = form.get("updated_at");
      if (typeof updated !== "string" || !Number.isFinite(Date.parse(updated))) return { error: "Reload the category first." };
      result = await supabase.from("categories").delete().eq("id", id).eq("updated_at", updated).select("id").maybeSingle();
    }
    if (result.error) return { error: catalogError(result.error.code) };
    if (!result.data) return { error: catalogError("40001") };
  } catch { return { error: catalogError() }; }
  revalidatePath("/admin", "layout");
  redirect(`/admin/${kind}?deleted=1`);
}
