"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { allowAuthMutation } from "@/lib/auth/mutation";
import { addAdminInquiryNote, lookupCustomerInquiries as queryCustomerInquiries, updateAdminInquiryStatus } from "@/lib/repositories/supabaseInquiryRepository";
import { uuidPattern } from "@/lib/validation/catalog";
import { inquiryStatuses, validateCustomerInquiryLookup, validateInquiryNote, type InquiryStatus } from "@/lib/validation/inquiry";
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

export type CustomerInquiryLookupState = {
  inquiries?: Awaited<ReturnType<typeof queryCustomerInquiries>>;
  error?: string;
  message?: string;
};

/** Public lookup is exact-match, same-origin, rate-limited and deliberately
 * returns no contact fields or private consultant notes to the browser.
 */
export async function lookupCustomerInquiries(_previous: CustomerInquiryLookupState, form: FormData): Promise<CustomerInquiryLookupState> {
  const identifier = validateCustomerInquiryLookup({ type: form.get("type"), value: form.get("value") });
  if (!identifier) return { error: "Enter a valid email address or phone number." };
  if (!(await allowAuthMutation("customer-inquiry-lookup", identifier.value, 5))) {
    return { error: "Too many lookup attempts. Wait a while and try again." };
  }
  try {
    const inquiries = await queryCustomerInquiries(identifier);
    return { inquiries, message: inquiries.length ? undefined : "No matching inquiries found. Check the contact detail and try again." };
  } catch {
    return { error: "Your inquiries are temporarily unavailable. Please try again later." };
  }
}
