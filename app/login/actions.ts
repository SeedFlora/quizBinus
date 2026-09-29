"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getLoginThrottle } from "@/lib/auth/login-throttle";
import { PASSWORD_MAX_LENGTH, dummyPasswordHash, verifyPassword } from "@/lib/auth/password";
import { safeNextPath } from "@/lib/auth/redirect";
import { createAuthSession } from "@/lib/auth/session";
import { describeError } from "@/lib/db/errors";
import { findUserByEmail, updateUser } from "@/lib/db/users";
import { isDatabaseConfigured, serverEnv } from "@/lib/env.server";
import { clientIp } from "@/lib/security/client-ip";
import { ensureServerReady } from "@/lib/server/bootstrap";

export type SignInErrorCode =
  "invalidEmail" | "passwordRequired" | "invalidCredentials" | "rateLimited" | "notConfigured" | "generic";

export type SignInState = { status: "idle" } | { status: "error"; error: SignInErrorCode };

const input = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  next: z.string().max(512).optional(),
});

/**
 * Email + password sign-in (database mode). Reachable by direct POST, so everything
 * is validated here again.
 *
 * Unknown email, wrong password and disabled account all answer the same generic
 * "Email atau kata sandi salah" and cost the same scrypt time, so the form cannot be
 * used to discover which addresses have accounts. Failures are throttled per
 * email + IP and per IP (lib/auth/login-throttle.ts).
 */
export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  if (!isDatabaseConfigured()) return { status: "error", error: "notConfigured" };

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = formData.get("password");
  if (!z.email().max(254).safeParse(email).success) return { status: "error", error: "invalidEmail" };
  if (typeof password !== "string" || password.length === 0) return { status: "error", error: "passwordRequired" };

  const parsed = input.safeParse({ email, password, next: formData.get("next") ?? undefined });
  if (!parsed.success) return { status: "error", error: "invalidCredentials" };

  const ip = clientIp(await headers(), serverEnv.trustProxy);
  const throttle = getLoginThrottle();
  if (throttle.isBlocked(email, ip)) return { status: "error", error: "rateLimited" };

  let userId: string | null = null;
  try {
    await ensureServerReady();
    const user = await findUserByEmail(email);
    // Always run scrypt, even without an account, so timing does not reveal one.
    const valid = await verifyPassword(parsed.data.password, user?.passwordHash ?? (await dummyPasswordHash()));
    if (user && valid && !user.disabled) {
      await createAuthSession(user.id);
      await updateUser(user.id, { lastLoginAt: new Date() });
      userId = user.id;
    }
  } catch (err) {
    console.error("[auth] sign-in failed", describeError(err));
    return { status: "error", error: "generic" };
  }

  if (!userId) {
    throttle.recordFailure(email, ip);
    return { status: "error", error: "invalidCredentials" };
  }
  throttle.recordSuccess(email, ip);
  // redirect() throws, so it stays outside the try/catch above.
  redirect(safeNextPath(parsed.data.next));
}
