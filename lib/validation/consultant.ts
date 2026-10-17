import { uuidPattern } from "@/lib/validation/catalog";

export type ConsultantState = { error?: string; fields?: Record<string, string>; values?: Record<string, string> };
export const consultantPhonePattern = /^[+]?[0-9]{9,15}$/;

export function zaloContactUrl(phone: string): string | null {
  // Do not remove arbitrary characters: malformed input must never become a link.
  if (typeof phone !== "string" || !consultantPhonePattern.test(phone) || /\s/.test(phone)) return null;
  return `https://zalo.me/${phone.replace(/^\+/, "")}`;
}

export function consultantAvatarUrl(value: string | null): string | null {
  if (!value || value.length > 2048 || !value.startsWith("https://res.cloudinary.com/") || /\s|\\/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "res.cloudinary.com" && !url.port && !url.username && !url.password && url.pathname !== "/" ? value : null;
  } catch { return null; }
}

export function validateConsultant(form: FormData) {
  const values: Record<string, string> = {};
  const fields: Record<string, string> = {};
  const text = (key: string) => {
    const raw = form.get(key);
    return values[key] = typeof raw === "string" ? raw.trim() : "";
  };
  const user_id = text("user_id");
  const public_name = text("public_name");
  const avatar_url = text("avatar_url");
  const zalo_phone = text("zalo_phone");
  const order = text("sort_order");
  const enabled = form.get("enabled") === "on";
  values.enabled = enabled ? "on" : "";
  if (!uuidPattern.test(user_id)) fields.user_id = "Choose an existing team member.";
  if (!public_name || [...public_name].length > 120 || public_name.includes("\0")) fields.public_name = "Enter a public name of 1–120 characters.";
  if (avatar_url && !consultantAvatarUrl(avatar_url)) fields.avatar_url = "Use an HTTPS image URL from res.cloudinary.com, or leave blank.";
  if (!zaloContactUrl(zalo_phone)) fields.zalo_phone = "Enter 9–15 digits with an optional leading +, without spaces.";
  if (!/^-?\d+$/.test(order) || !Number.isSafeInteger(Number(order)) || Number(order) < -2147483648 || Number(order) > 2147483647) fields.sort_order = "Enter a whole number between -2147483648 and 2147483647.";
  if (form.has("enabled") && !["", "on"].includes(String(form.get("enabled")))) fields.enabled = "Choose whether this consultant is visible.";
  return { values, fields, data: { user_id, public_name, avatar_url: avatar_url || null, zalo_phone, sort_order: Number(order), enabled } };
}

export function consultantError(code?: string) {
  switch (code) {
    case "23505": return "This team member already has a consultant profile. Reload to edit it.";
    case "23503": return "This team member is no longer available. Reload and choose another member.";
    case "40001": return "This profile changed or was deleted. Reload before saving again; your input is kept here.";
    case "42501": return "Your session or permissions no longer allow this action. Sign in again.";
    default: return "Unable to save consultant changes. Reload before retrying if the result is uncertain.";
  }
}
