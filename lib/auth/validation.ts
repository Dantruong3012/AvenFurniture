export function validEmail(value: string) {
  if (value.length > 254) return false;
  const parts = value.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  // RFC 5322 dot-atom local parts and DNS host names. Reject consecutive or
  // edge dots, invalid host labels, and addresses that a mailer cannot route.
  if (!local || local.length > 64 || !/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(local)) return false;
  const labels = domain.split(".");
  return domain.length <= 253 && labels.length >= 2 && labels.every((label) =>
    label.length > 0 && label.length <= 63 && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label)
  ) && /^[A-Za-z]{2,63}$/.test(labels.at(-1)!);
}
export function validNewPassword(value: string, confirmation: string) {
  return value.length >= 12 && value.length <= 128 && value === confirmation;
}
export function recoveryType(value: unknown): "recovery" | "invite" | null {
  return value === "recovery" || value === "invite" ? value : null;
}

export type StaffRole = "super_admin" | "admin" | "editor" | "staff";
export function staffRole(value: unknown): StaffRole | null {
  return value === "super_admin" || value === "admin" || value === "editor" || value === "staff" ? value : null;
}
export function assignableStaffRole(value: unknown, manager: StaffRole): "super_admin" | "admin" | "editor" | null {
  if (value === "admin" || value === "editor") return value;
  return value === "super_admin" && manager === "super_admin" ? value : null;
}
export function validStaffId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
export function validStaffName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 1 && value.trim().length <= 120 && !/[\u0000-\u001f\u007f]/.test(value);
}

export type StaffInviteRole = "admin" | "editor" | "staff";
export type StaffInvitation = { email: string; display_name: string; role: StaffInviteRole };
export function parseStaffInvitation(value: { email: unknown; display_name: unknown; role: unknown }): StaffInvitation | null {
  if (typeof value.email !== "string" || typeof value.display_name !== "string") return null;
  const email = value.email.trim().toLowerCase();
  const display_name = value.display_name.trim();
  if (!validEmail(email) || !validStaffName(display_name) ||
      (value.role !== "admin" && value.role !== "editor" && value.role !== "staff")) return null;
  return { email, display_name, role: value.role };
}
