import "server-only";
import { eq, lt } from "drizzle-orm";
import { requireDb } from "./client";
import { authSessions, users } from "./schema";
import type { UserRecord } from "./users";

/**
 * Lecturer sign-in sessions. The cookie carries a random token; only its sha256 is
 * stored (lib/auth/session-token.ts), so a leaked table cannot be replayed.
 */

export interface AuthSessionRow {
  id: string;
  userId: string;
  expiresAt: Date;
  lastSeenAt: Date;
}

export async function insertAuthSession(input: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string | null;
}): Promise<void> {
  await requireDb()
    .insert(authSessions)
    .values({
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      userAgent: input.userAgent?.slice(0, 300) ?? null,
    });
}

/** The session and its user for a token hash, or null. Expiry/disabled are the caller's call. */
export async function findAuthSession(
  tokenHash: string,
): Promise<{ session: AuthSessionRow; user: UserRecord } | null> {
  const [row] = await requireDb()
    .select({
      session: {
        id: authSessions.id,
        userId: authSessions.userId,
        expiresAt: authSessions.expiresAt,
        lastSeenAt: authSessions.lastSeenAt,
      },
      user: users,
    })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(eq(authSessions.tokenHash, tokenHash))
    .limit(1);
  return row ?? null;
}

export async function touchAuthSession(id: string, at: Date = new Date()): Promise<void> {
  await requireDb().update(authSessions).set({ lastSeenAt: at }).where(eq(authSessions.id, id));
}

export async function deleteAuthSession(tokenHash: string): Promise<void> {
  await requireDb().delete(authSessions).where(eq(authSessions.tokenHash, tokenHash));
}

export async function deleteAuthSessionById(id: string): Promise<void> {
  await requireDb().delete(authSessions).where(eq(authSessions.id, id));
}

/** Housekeeping: drops expired rows. Returns how many were removed. */
export async function purgeExpiredAuthSessions(now: Date = new Date()): Promise<number> {
  const removed = await requireDb()
    .delete(authSessions)
    .where(lt(authSessions.expiresAt, now))
    .returning({ id: authSessions.id });
  return removed.length;
}
