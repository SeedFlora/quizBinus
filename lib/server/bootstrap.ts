import "server-only";
import { z } from "zod";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { isDatabaseConfigured, serverEnv } from "@/lib/env.server";
import { purgeExpiredAuthSessions } from "@/lib/db/auth-sessions";
import { describeError } from "@/lib/db/errors";
import { runMigrations } from "@/lib/db/migrate";
import { countQuizzes, saveQuiz } from "@/lib/db/quizzes";
import { postgresSessionPersistence } from "@/lib/db/session-persistence";
import { countUsers, createUser, findUserByEmail } from "@/lib/db/users";
import { SEED_QUIZZES } from "@/lib/seed/quizzes";
import { getGameRuntime } from "./game-runtime";

/**
 * One-time server startup, shared by instrumentation.ts (boot) and every route
 * handler (`await ensureServerReady()` is free after the first call).
 *
 * Database mode:
 *   1. apply pending migrations (drizzle/),
 *   2. first boot only (users table empty): create the admin from ADMIN_EMAIL /
 *      ADMIN_PASSWORD and give it the five demo quizzes,
 *   3. plug Postgres persistence into the game runtime.
 * Always: restore unfinished sessions into the runtime.
 *
 * Never throws: a database that is down at boot is logged and retried on a later
 * call (at most every RETRY_MS), while memory-only features keep working.
 */

const RETRY_MS = 15_000;

interface BootState {
  promise: Promise<void> | null;
  /** Set while the database part of the boot has not succeeded yet. */
  failedAt: number | null;
}

const globalForBoot = globalThis as unknown as { __nqBoot?: BootState };

function state(): BootState {
  globalForBoot.__nqBoot ??= { promise: null, failedAt: null };
  return globalForBoot.__nqBoot;
}

export function ensureServerReady(): Promise<void> {
  const s = state();
  if (!s.promise || (s.failedAt !== null && Date.now() - s.failedAt > RETRY_MS)) {
    s.promise = boot(s);
  }
  return s.promise;
}

async function boot(s: BootState): Promise<void> {
  const runtime = getGameRuntime();
  if (isDatabaseConfigured()) {
    // Before ready(): the runtime restores sessions through whichever persistence it has.
    runtime.usePersistence(postgresSessionPersistence);
    try {
      await runMigrations();
      await bootstrapAdmin();
      await purgeExpiredAuthSessions().catch(() => 0);
      s.failedAt = null;
    } catch (err) {
      s.failedAt = Date.now();
      // describeError drops a failed query's bound values (the admin's password hash).
      console.error("[nusaquest] database startup failed; retrying on a later request:", describeError(err));
    }
  }
  await runtime.ready();
}

/**
 * First boot: an empty users table + ADMIN_EMAIL/ADMIN_PASSWORD creates the first
 * admin, who also receives the demo quizzes so the dashboard is not empty.
 * Later boots never touch accounts (changing ADMIN_PASSWORD does not reset it).
 */
async function bootstrapAdmin(): Promise<void> {
  if ((await countUsers()) > 0) return;
  const { adminEmail, adminPassword, adminName } = serverEnv;
  if (!adminEmail || !adminPassword) {
    console.warn(
      "[nusaquest] no lecturer accounts yet: set ADMIN_EMAIL and ADMIN_PASSWORD and restart to create the first admin",
    );
    return;
  }
  if (!z.email().safeParse(adminEmail).success) {
    console.error("[nusaquest] ADMIN_EMAIL is not a valid email; admin account not created");
    return;
  }
  if (adminPassword.length < PASSWORD_MIN_LENGTH) {
    console.error(
      `[nusaquest] ADMIN_PASSWORD must be at least ${PASSWORD_MIN_LENGTH} characters; admin account not created`,
    );
    return;
  }

  let admin: { id: string };
  try {
    admin = await createUser({
      email: adminEmail,
      password: adminPassword,
      fullName: adminName || "Administrator",
      role: "admin",
    });
    console.info(`[nusaquest] created admin account ${adminEmail}`);
  } catch (err) {
    // Another booting instance may have won the race; the unique email decides.
    const existing = await findUserByEmail(adminEmail);
    if (!existing) throw err;
    admin = existing;
  }

  if ((await countQuizzes(admin.id)) === 0) {
    // Reverse order: the newest save heads "Terakhir diubah", so the flagship OS Battle
    // (SEED_QUIZZES[0], the quiz the README and demos use) is first on the dashboard.
    for (const quiz of [...SEED_QUIZZES].reverse()) await saveQuiz(quiz, admin.id);
    console.info(`[nusaquest] imported ${SEED_QUIZZES.length} demo quizzes for ${adminEmail}`);
  }
}
