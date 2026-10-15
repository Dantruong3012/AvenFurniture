export function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
export function validNewPassword(value: string, confirmation: string) {
  return value.length >= 12 && value.length <= 128 && value === confirmation;
}
export function recoveryType(value: unknown): "recovery" | "invite" | null {
  return value === "recovery" || value === "invite" ? value : null;
}
