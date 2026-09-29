import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SEED_QUIZZES } from "@/lib/seed/quizzes";
import { TEST_DATABASE_URL, createTestDatabase } from "./pg";

vi.mock("server-only", () => ({}));

/**
 * First boot in database mode (lib/server/bootstrap.ts): migrations on an empty
 * database, the admin from ADMIN_EMAIL / ADMIN_PASSWORD, the demo quizzes, and the
 * runtime wired to Postgres, restoring a running session. Own database, own env.
 */
describe.skipIf(!TEST_DATABASE_URL)("Postgres integration: server bootstrap", () => {
  let drop: (() => Promise<void>) | null = null;
  let closeDb: (() => Promise<void>) | null = null;
  const env = ["DATABASE_URL", "ADMIN_EMAIL", "ADMIN_PASSWORD", "ADMIN_NAME"] as const;

  beforeAll(async () => {
    const created = await createTestDatabase("boot");
    drop = created.drop;
    process.env.DATABASE_URL = created.url;
    process.env.ADMIN_EMAIL = "Admin@Binus.edu";
    process.env.ADMIN_PASSWORD = "sandi-admin-awal";
    process.env.ADMIN_NAME = "Admin NUSAQUEST";
    // Fresh process-wide singletons for this file.
    const g = globalThis as Record<string, unknown>;
    delete g.__nqBoot;
    delete g.__nqRuntime;
    vi.resetModules();
    closeDb = (await import("@/lib/db/client")).closeDb;
  }, 60_000);

  afterAll(async () => {
    await closeDb?.();
    await drop?.();
    for (const name of env) delete process.env[name];
  });

  it("migrates, creates the first admin with the demo quizzes, and is idempotent", async () => {
    const { ensureServerReady } = await import("@/lib/server/bootstrap");
    const users = await import("@/lib/db/users");
    const quizzes = await import("@/lib/db/quizzes");
    const { verifyPassword } = await import("@/lib/auth/password");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await ensureServerReady();
    const admin = await users.findUserByEmail("admin@binus.edu");
    expect(admin).toMatchObject({ role: "admin", fullName: "Admin NUSAQUEST", disabled: false });
    await expect(verifyPassword("sandi-admin-awal", admin!.passwordHash)).resolves.toBe(true);
    const list = await quizzes.listQuizzes(admin!.id);
    expect(list.map((q) => q.title).sort()).toEqual(SEED_QUIZZES.map((q) => q.title).sort());

    // Memoized, and a second boot (new process) changes nothing.
    await ensureServerReady();
    delete (globalThis as Record<string, unknown>).__nqBoot;
    await ensureServerReady();
    expect(await users.countUsers()).toBe(1);
    expect(await quizzes.countQuizzes(admin!.id)).toBe(SEED_QUIZZES.length);
    info.mockRestore();
  });

  it("plugs Postgres into the game runtime so hosted sessions are written behind", async () => {
    const { getGameRuntime } = await import("@/lib/server/game-runtime");
    const { postgresSessionPersistence } = await import("@/lib/db/session-persistence");
    const users = await import("@/lib/db/users");
    const quizzes = await import("@/lib/db/quizzes");
    const { getPool } = await import("@/lib/db/client");
    const admin = (await users.findUserByEmail("admin@binus.edu"))!;
    const quiz = (await quizzes.getQuiz("os-battle", admin.id))!;

    const runtime = getGameRuntime();
    const { sessionId, roomCode } = await runtime.createSession(quiz, { id: admin.id, displayName: "Admin" });
    await postgresSessionPersistence.flush();
    const { rows } = await getPool()!.query("select status, room_code, quiz_id from game_sessions where id = $1", [
      sessionId,
    ]);
    expect(rows).toEqual([{ status: "lobby", room_code: roomCode, quiz_id: quiz.id }]);
    expect(await postgresSessionPersistence.isRoomCodeTaken(roomCode)).toBe(true);
    runtime.drop(sessionId);
  });
});
