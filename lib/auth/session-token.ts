import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * Pure pieces of lecturer sessions (lib/auth/session.ts wires them to cookies and
 * the database). Kept separate so they are unit-testable without a request scope.
 */

export { SESSION_COOKIE } from "./cookie-name";
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** last_seen_at is written at most this often per session (one UPDATE, not one per request). */
export const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/** 256-bit url-safe secret (43 characters). */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What the database stores: hex sha256 of the cookie value. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Cheap shape check before touching the database with an arbitrary cookie value. */
export function isWellFormedToken(value: string | undefined | null): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

/**
 * Secure flag for the session cookie.
 *   "true" / "false"  forced (e.g. "false" for plain-http classroom LAN installs)
 *   "auto"            Secure when the browser reached us over https, as reported by the
 *                     reverse proxy (X-Forwarded-Proto; first value when chained)
 */
export function cookieIsSecure(setting: "auto" | "true" | "false", forwardedProto: string | null): boolean {
  if (setting === "true") return true;
  if (setting === "false") return false;
  return forwardedProto?.split(",")[0]?.trim().toLowerCase() === "https";
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

export type SessionCheck = "valid" | "expired" | "disabled";

export function checkSession(
  session: { expiresAt: Date },
  user: { disabled: boolean },
  now: number = Date.now(),
): SessionCheck {
  if (session.expiresAt.getTime() <= now) return "expired";
  if (user.disabled) return "disabled";
  return "valid";
}

export function shouldTouch(lastSeenAt: Date, now: number = Date.now()): boolean {
  return now - lastSeenAt.getTime() >= SESSION_TOUCH_INTERVAL_MS;
}
