// Keep these options identical for browser, server and proxy clients.
// Browser SSR refresh needs access to its cookie; do not add HttpOnly here.
export const authCookieOptions = {
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

export function authStorageKey(url: string) {
  return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
}

export function isSessionCookie(name: string, storageKey: string) {
  // Only remove this project's session and chunks, not Cloudinary, other
  // projects' cookies, or a recovery/PKCE verifier belonging to another flow.
  return name === storageKey || new RegExp(`^${storageKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.\\d+$`).test(name);
}
