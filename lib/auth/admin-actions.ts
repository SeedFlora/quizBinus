"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { SALUTATIONS } from "@/components/creator/profile-schema";
import { describeError, isUniqueViolation } from "@/lib/db/errors";
import {
  countActiveAdmins,
  createUser,
  getUserById,
  listUsers,
  setUserPassword,
  updateUser,
  type PublicUser,
} from "@/lib/db/users";
import { isDatabaseConfigured, serverEnv } from "@/lib/env.server";
import { clientIp } from "@/lib/security/client-ip";
import { getLecturerOrNull, type Lecturer } from "./lecturer";
import { getLoginThrottle } from "./login-throttle";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, temporaryPassword, verifyPassword } from "./password";
import { createAuthSession } from "./session";

/**
 * Account management (database mode). Server Functions are public endpoints, so
 * each one re-checks who is calling: admin-only actions verify the role from the
 * database session (getLecturerOrNull reads the users row on every request), and
 * Next.js rejects cross-origin Server Function calls.
 *
 * Temporary passwords are generated here, returned ONCE to the admin's screen and
 * only stored hashed.
 */

/** An account row as the settings screen shows it (dates as ISO strings). */
export interface AccountView {
  id: string;
  email: string;
  fullName: string;
  salutation: string;
  role: "admin" | "lecturer";
  disabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export type CreateAccountError = "invalid" | "emailTaken" | "forbidden" | "generic";
export type CreateAccountState =
  | { status: "idle" }
  | { status: "created"; email: string; fullName: string; password: string; at: number }
  | { status: "error"; error: CreateAccountError; at: number };

export type AccountActionError = "forbidden" | "notFound" | "self" | "lastAdmin" | "generic";
export type AccountActionResult = { ok: true; password?: string } | { ok: false; error: AccountActionError };

export type ChangePasswordError =
  "invalid" | "tooShort" | "mismatch" | "wrongPassword" | "rateLimited" | "forbidden" | "generic";
export type ChangePasswordState =
  { status: "idle" } | { status: "saved"; at: number } | { status: "error"; error: ChangePasswordError; at: number };

function toView(user: PublicUser): AccountView {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    salutation: user.salutation,
    role: user.role,
    disabled: user.disabled,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

async function currentDbLecturer(): Promise<Lecturer | null> {
  if (!isDatabaseConfigured()) return null;
  const lecturer = await getLecturerOrNull();
  return lecturer?.source === "db" ? lecturer : null;
}

async function requireAdmin(): Promise<Lecturer | null> {
  const lecturer = await currentDbLecturer();
  return lecturer?.role === "admin" ? lecturer : null;
}

const userIdSchema = z.uuid();

/** Every account, admins first. Empty for non-admins. */
export async function listLecturers(): Promise<AccountView[]> {
  if (!(await requireAdmin())) return [];
  return (await listUsers()).map(toView);
}

const createSchema = z.object({
  email: z.email().max(254),
  fullName: z.string().trim().min(2).max(60),
  salutation: z.enum(SALUTATIONS),
  role: z.enum(["lecturer", "admin"]),
});

export async function createLecturer(_prev: CreateAccountState, formData: FormData): Promise<CreateAccountState> {
  const at = Date.now();
  if (!(await requireAdmin())) return { status: "error", error: "forbidden", at };
  const parsed = createSchema.safeParse({
    email: String(formData.get("email") ?? "")
      .trim()
      .toLowerCase(),
    fullName: formData.get("fullName"),
    salutation: formData.get("salutation"),
    role: formData.get("role") ?? "lecturer",
  });
  if (!parsed.success) return { status: "error", error: "invalid", at };

  const password = temporaryPassword();
  try {
    const user = await createUser({ ...parsed.data, password });
    revalidatePath("/settings");
    return { status: "created", email: user.email, fullName: user.fullName, password, at };
  } catch (err) {
    if (isUniqueViolation(err)) return { status: "error", error: "emailTaken", at };
    console.error("[auth] create account failed", describeError(err));
    return { status: "error", error: "generic", at };
  }
}

/** Disables (signs out everywhere, blocks sign-in) or re-enables an account. */
export async function setLecturerDisabled(userId: string, disabled: boolean): Promise<AccountActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "forbidden" };
  const id = userIdSchema.safeParse(userId);
  if (!id.success || typeof disabled !== "boolean") return { ok: false, error: "notFound" };
  if (id.data === admin.id) return { ok: false, error: "self" };
  try {
    const target = await getUserById(id.data);
    if (!target) return { ok: false, error: "notFound" };
    if (disabled && target.role === "admin" && !target.disabled && (await countActiveAdmins()) <= 1) {
      return { ok: false, error: "lastAdmin" };
    }
    await updateUser(id.data, { disabled });
    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    console.error("[auth] update account failed", describeError(err));
    return { ok: false, error: "generic" };
  }
}

/** Replaces another account's password with a temporary one (signs it out everywhere). */
export async function resetLecturerPassword(userId: string): Promise<AccountActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "forbidden" };
  const id = userIdSchema.safeParse(userId);
  if (!id.success) return { ok: false, error: "notFound" };
  // Your own password is changed with the current one (changeOwnPassword).
  if (id.data === admin.id) return { ok: false, error: "self" };
  try {
    const password = temporaryPassword();
    if (!(await setUserPassword(id.data, password))) return { ok: false, error: "notFound" };
    revalidatePath("/settings");
    return { ok: true, password };
  } catch (err) {
    console.error("[auth] reset password failed", describeError(err));
    return { ok: false, error: "generic" };
  }
}

const changeSchema = z.object({
  current: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  next: z.string().max(PASSWORD_MAX_LENGTH),
  confirm: z.string().max(PASSWORD_MAX_LENGTH),
});

/**
 * Any signed-in lecturer: change your own password (e.g. the temporary one from the
 * admin). Other devices are signed out; this one gets a fresh session.
 */
export async function changeOwnPassword(_prev: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const at = Date.now();
  const lecturer = await currentDbLecturer();
  if (!lecturer) return { status: "error", error: "forbidden", at };
  const parsed = changeSchema.safeParse({
    current: formData.get("current"),
    next: formData.get("next"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { status: "error", error: "invalid", at };
  const { current, next, confirm } = parsed.data;
  if (next.length < PASSWORD_MIN_LENGTH) return { status: "error", error: "tooShort", at };
  if (next !== confirm) return { status: "error", error: "mismatch", at };
  // A stolen session cookie must not become a way to guess the account's password.
  const throttle = getLoginThrottle();
  const ip = `change:${clientIp(await headers(), serverEnv.trustProxy)}`;
  if (throttle.isBlocked(lecturer.id, ip)) return { status: "error", error: "rateLimited", at };
  try {
    const user = await getUserById(lecturer.id);
    if (!user || !(await verifyPassword(current, user.passwordHash))) {
      throttle.recordFailure(lecturer.id, ip);
      return { status: "error", error: "wrongPassword", at };
    }
    throttle.recordSuccess(lecturer.id, ip);
    await setUserPassword(user.id, next);
    await createAuthSession(user.id);
    return { status: "saved", at };
  } catch (err) {
    console.error("[auth] change password failed", describeError(err));
    return { status: "error", error: "generic", at };
  }
}
