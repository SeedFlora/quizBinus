/**
 * Pure routing rules for proxy.ts (kept here so they are unit-testable and free of
 * Next.js / database imports; the proxy runs before every matched request).
 *
 * The proxy only does the OPTIMISTIC check "is there a session cookie at all". The
 * real check (token hash, expiry, disabled account) happens in getLecturer() /
 * getLecturerOrNull(), next to the data.
 */

/** Request header carrying the requested path to Server Components (login back-link). */
export const REQUEST_PATH_HEADER = "x-nq-path";

/**
 * Lecturer-only areas in database mode. This includes the projector demo
 * (/host/session/demo): only a signed-in lecturer can drive the shared server demo,
 * so only they may open it. Memory mode never redirects anything.
 */
const PROTECTED_PREFIXES = ["/dashboard", "/quizzes", "/sessions", "/settings", "/analytics", "/host"] as const;

function underPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** True for lecturer-only pages. */
export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => underPrefix(pathname, p));
}

/** Database mode is on when DATABASE_URL is set (same rule as isDatabaseConfigured()). */
export function isDatabaseMode(env: Record<string, string | undefined>): boolean {
  return Boolean(env.DATABASE_URL?.trim());
}

export interface ProxyDecisionInput {
  pathname: string;
  /** Query string including the leading "?", or "". */
  search: string;
  hasSessionCookie: boolean;
  databaseMode: boolean;
}

/**
 * Where to send the request: a relative "/login?next=…" URL, or null to let it
 * through. Memory mode never redirects (the demo lecturer needs no sign-in).
 */
export function loginRedirectFor(input: ProxyDecisionInput): string | null {
  if (!input.databaseMode || input.hasSessionCookie) return null;
  if (!isProtectedPath(input.pathname)) return null;
  const next = `${input.pathname}${input.search}`;
  return `/login?next=${encodeURIComponent(next)}`;
}

export { SESSION_COOKIE } from "./cookie-name";
