"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { allowAuthMutation } from "@/lib/auth/mutation";
import { addAdminInquiryNote, updateAdminInquiryStatus } from "@/lib/repositories/supabaseInquiryRepository";
import { uuidPattern } from "@/lib/validation/catalog";
import { inquiryStatuses, validateInquiryNote, type InquiryStatus } from "@/lib/validation/inquiry";
import type { AdminInquiryActionState } from "@/lib/types";

export async function changeInquiryStatus(_previous: AdminInquiryActionState, form: FormData): Promise<AdminInquiryActionState> {
  const { supabase, user } = await requireAdmin();
  if (!(await allowAuthMutation("inquiry-status", user.id, 120))) return { error: "Request denied or too many changes. Wait and retry from this site." };
  const id = form.get("id"), status = form.get("status");
  if (typeof id !== "string" || !uuidPattern.test(id)) return { error: "Choose a valid inquiry." };
  if (typeof status !== "string" || !inquiryStatuses.includes(status as InquiryStatus)) return { error: "Choose a valid inquiry status." };
  try {
    await updateAdminInquiryStatus(supabase, id, status as InquiryStatus);
  } catch {
    return { error: "Unable to update this inquiry. Refresh and check that your session and the inquiry are still available." };
  }
  revalidatePath("/admin/inquiries");
  return { success: "Status updated." };
}

export async function createInquiryNote(_previous: AdminInquiryActionState, form: FormData): Promise<AdminInquiryActionState> {
  const { supabase, user } = await requireAdmin();
  if (!(await allowAuthMutation("inquiry-note", user.id, 120))) return { error: "Request denied or too many changes. Wait and retry from this site." };
  const id = form.get("id");
  if (typeof id !== "string" || !uuidPattern.test(id)) return { error: "Choose a valid inquiry." };
  let body: string;
  try { body = validateInquiryNote(form.get("body")); }
  catch { return { error: "Enter a note of 1–10000 characters." }; }
  try {
    await addAdminInquiryNote(supabase, id, body);
  } catch {
    return { error: "Unable to confirm the note was saved. Refresh and check the timeline before retrying." };
  }
  revalidatePath("/admin/inquiries");
  return { success: "Internal note added." };
}
