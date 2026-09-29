import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { serverEnv } from "@/lib/env.server";
import {
  deleteAuthSession,
  deleteAuthSessionById,
  findAuthSession,
  insertAuthSession,
  touchAuthSession,
} from "@/lib/db/auth-sessions";
import { getDb } from "@/lib/db/client";
import { describeError } from "@/lib/db/errors";
import type { UserRole } from "@/lib/db/schema";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  checkSession,
  cookieIsSecure,
  hashSessionToken,
  isWellFormedToken,
  newSessionToken,
  sessionCookieOptions,
  shouldTouch,
} from "./session-token";

/**
 * Lecturer sessions (database mode): an opaque random token in the HttpOnly
 * `nq_session` cookie, stored as sha256 in auth_sessions. 14-day lifetime,
 * revocable per device (sign out), per account (password reset, disable).
 */

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  salutation: string;
  role: UserRole;
  locale: "id" | "en";
}

/** Starts a session for `userId` and sets the cookie. Server Functions / Route Handlers only. */
export async function createAuthSession(userId: string): Promise<void> {
  const h = await headers();
  const token = newSessionToken();
  await insertAuthSession({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    userAgent: h.get("user-agent"),
  });
  const secure = cookieIsSecure(serverEnv.cookieSecure, h.get("x-forwarded-proto"));
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(secure));
}

/**
 * The signed-in user, or null (memory mode, no/unknown cookie, expired, disabled).
 * Memoised per request, so a layout and its page share one lookup.
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  if (!getDb()) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!isWellFormedToken(token)) return null;

  let found: Awaited<ReturnType<typeof findAuthSession>>;
  try {
    found = await findAuthSession(hashSessionToken(token));
  } catch (err) {
    // Database down: treat as signed out rather than crash every page.
    console.error("[auth] session lookup failed", describeError(err));
    return null;
  }
  if (!found) return null;

  const { session, user } = found;
  const now = Date.now();
  if (checkSession(session, user, now) !== "valid") {
    await deleteAuthSessionById(session.id).catch(() => undefined);
    return null;
  }
  if (shouldTouch(session.lastSeenAt, now)) {
    await touchAuthSession(session.id, new Date(now)).catch(() => undefined);
  }
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    salutation: user.salutation,
    role: user.role,
    locale: user.locale,
  };
});

/** Ends the session on THIS device and clears the cookie. Server Functions / Route Handlers only. */
export async function destroyAuthSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (getDb() && isWellFormedToken(token)) {
    await deleteAuthSession(hashSessionToken(token)).catch((err) =>
      console.error("[auth] sign-out cleanup failed", describeError(err)),
    );
  }
  store.delete(SESSION_COOKIE);
}
