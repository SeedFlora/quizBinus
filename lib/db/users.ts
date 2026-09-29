import "server-only";
import { and, asc, count, eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth/password";
import { requireDb } from "./client";
import { isUuid } from "./errors";
import { authSessions, users, type UserRole } from "./schema";

/**
 * Lecturer / admin accounts. Emails are normalized to lowercase here (the column
 * enforces it), so every lookup is a plain equality on the unique index.
 */

export type UserRecord = typeof users.$inferSelect;

/** An account as the UI may see it: never the password hash. */
export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  salutation: string;
  role: UserRole;
  locale: "id" | "en";
  disabled: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function toPublicUser(row: UserRecord): PublicUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    salutation: row.salutation,
    role: row.role,
    locale: row.locale,
    disabled: row.disabled,
    createdAt: row.createdAt,
    lastLoginAt: row.lastLoginAt,
  };
}

/** Full row including the password hash (sign-in only). */
export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const [row] = await requireDb()
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1);
  return row ?? null;
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  if (!isUuid(id)) return null;
  const [row] = await requireDb().select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

/** Throws a unique violation (see isUniqueViolation) when the email is taken. */
export async function createUser(input: {
  email: string;
  password: string;
  fullName: string;
  salutation?: string;
  role?: UserRole;
  locale?: "id" | "en";
}): Promise<PublicUser> {
  const [row] = await requireDb()
    .insert(users)
    .values({
      email: normalizeEmail(input.email),
      passwordHash: await hashPassword(input.password),
      fullName: input.fullName.trim(),
      salutation: input.salutation?.trim() ?? "",
      role: input.role ?? "lecturer",
      locale: input.locale ?? "id",
    })
    .returning();
  return toPublicUser(row!);
}

/** Admins first, then by name. */
export async function listUsers(): Promise<PublicUser[]> {
  const rows = await requireDb().select().from(users).orderBy(asc(users.role), asc(users.fullName));
  return rows.map(toPublicUser);
}

export interface UserPatch {
  fullName?: string;
  salutation?: string;
  role?: UserRole;
  locale?: "id" | "en";
  disabled?: boolean;
  lastLoginAt?: Date;
}

/**
 * Updates profile/admin fields. Disabling an account also signs it out everywhere.
 * Returns null when the user does not exist.
 */
export async function updateUser(id: string, patch: UserPatch): Promise<PublicUser | null> {
  if (!isUuid(id)) return null;
  const db = requireDb();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(users)
      .set({
        ...(patch.fullName !== undefined ? { fullName: patch.fullName.trim() } : {}),
        ...(patch.salutation !== undefined ? { salutation: patch.salutation.trim() } : {}),
        ...(patch.role !== undefined ? { role: patch.role } : {}),
        ...(patch.locale !== undefined ? { locale: patch.locale } : {}),
        ...(patch.disabled !== undefined ? { disabled: patch.disabled } : {}),
        ...(patch.lastLoginAt !== undefined ? { lastLoginAt: patch.lastLoginAt } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    if (!row) return null;
    if (patch.disabled === true) await tx.delete(authSessions).where(eq(authSessions.userId, id));
    return toPublicUser(row);
  });
}

/** Sets a new password and revokes every existing sign-in of that account. */
export async function setUserPassword(id: string, password: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const passwordHash = await hashPassword(password);
  return requireDb().transaction(async (tx) => {
    const updated = await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning({ id: users.id });
    if (updated.length === 0) return false;
    await tx.delete(authSessions).where(eq(authSessions.userId, id));
    return true;
  });
}

export async function countUsers(): Promise<number> {
  const [row] = await requireDb().select({ n: count() }).from(users);
  return row?.n ?? 0;
}

/** Active (not disabled) admins: the last one cannot be disabled or demoted. */
export async function countActiveAdmins(): Promise<number> {
  const [row] = await requireDb()
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.disabled, false)));
  return row?.n ?? 0;
}
