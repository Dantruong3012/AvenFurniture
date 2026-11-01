"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { allowAuthMutation } from "@/lib/auth/mutation";
import { uuidPattern } from "@/lib/validation/catalog";
import { consultantError, validateConsultant, type ConsultantState } from "@/lib/validation/consultant";

function updatedAt(form: FormData) {
  const value = form.get("updated_at");
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
}

export async function saveConsultant(_previous: ConsultantState, form: FormData): Promise<ConsultantState> {
  const { supabase, user } = await requireAdmin("super_admin");
  const parsed = validateConsultant(form);
  const failure = (error: string): ConsultantState => ({ error, fields: parsed.fields, values: parsed.values });
  if (!(await allowAuthMutation("consultant-save", user.id, 120))) return failure("Request denied. Wait and retry from this site.");
  if (Object.keys(parsed.fields).length) return failure("Please correct the fields below.");
  const mode = form.get("mode");
  if (mode !== "create" && mode !== "update") return failure("Reload the consultant form before saving.");
  const version = updatedAt(form);
  if (mode === "update" && !version) return failure("Reload this profile before saving.");
  try {
    const { user_id, ...changes } = parsed.data;
    // An insert intentionally fails on duplicates; it cannot overwrite a profile.
    // The FK restricts creation to an existing admin_profiles.user_id.
    const result = mode === "create"
      ? await supabase.from("consultant_profiles").insert(parsed.data).select("user_id").single()
      : await supabase.from("consultant_profiles").update(changes).eq("user_id", user_id).eq("updated_at", version!).select("user_id").maybeSingle();
    if (result.error) return failure(consultantError(result.error.code));
    if (!result.data) return failure(consultantError("40001"));
  } catch { return failure(consultantError()); }
  revalidatePath("/consultants");
  revalidatePath("/admin/consultants");
  redirect("/admin/consultants?saved=1");
}

export async function deleteConsultant(_previous: ConsultantState, form: FormData): Promise<ConsultantState> {
  const { supabase, user } = await requireAdmin("super_admin");
  if (!(await allowAuthMutation("consultant-delete", user.id, 60))) return { error: "Request denied. Wait and retry from this site." };
  const id = form.get("user_id");
  const version = updatedAt(form);
  if (typeof id !== "string" || !uuidPattern.test(id) || !version || form.get("confirmed") !== "on") return { error: "Reload the profile and confirm deletion first." };
  try {
    const { data, error } = await supabase.from("consultant_profiles").delete().eq("user_id", id).eq("updated_at", version).select("user_id").maybeSingle();
    if (error) return { error: consultantError(error.code) };
    if (!data) return { error: consultantError("40001") };
  } catch { return { error: consultantError() }; }
  revalidatePath("/consultants");
  revalidatePath("/admin/consultants");
  redirect("/admin/consultants?deleted=1");
}
