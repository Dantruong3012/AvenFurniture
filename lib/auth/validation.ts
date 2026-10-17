export function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
