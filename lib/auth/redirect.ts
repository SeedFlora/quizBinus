/** Where a lecturer lands after signing in when no (valid) `next` is given. */
export const DEFAULT_AFTER_SIGN_IN = "/dashboard";

/**
 * Sanitises a post-sign-in destination. Only same-origin absolute paths are
 * allowed, so `?next=https://evil.example` or `//evil.example` (protocol-relative)
 * cannot turn the login page into an open redirect.
 */
export function safeNextPath(value: unknown, fallback: string = DEFAULT_AFTER_SIGN_IN): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  // Control characters (incl. tab/newline) can be normalised away by browsers.
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return fallback;
  }
  // Never bounce back into the auth flow itself.
  if (value.startsWith("/login") || value.startsWith("/auth/")) return fallback;
  return value;
}

/**
 * 303 to a same-origin path with a RELATIVE Location header. Behind a reverse
 * proxy or in Docker, `request.url` can carry the internal host
 * (http://0.0.0.0:3000); a relative Location always resolves against what the
 * browser actually used. Cookies set through `cookies()` are still attached.
 */
export function seeOther(path: string): Response {
  return new Response(null, { status: 303, headers: { Location: path, "Cache-Control": "no-store" } });
}
