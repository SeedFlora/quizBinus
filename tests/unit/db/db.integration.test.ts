import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Quiz } from "@/lib/game/types";
import type { PlayerCredentials } from "@/lib/realtime/types";
import type { GameAuthority as GameAuthorityType } from "@/lib/realtime/authority";
import { SEED_QUIZZES } from "@/lib/seed/quizzes";
import { question, quiz as buildQuiz } from "../../fixtures/quiz";
import { TEST_DATABASE_URL, createTestDatabase } from "./pg";

vi.mock("server-only", () => ({}));

/**
 * Runs the database layer against a real Postgres (see ./pg.ts). Covers: migrations
 * on an empty database, accounts and sign-in sessions, the quiz repository round
 * trip for every question type, session write-behind (restore, room codes,
 * normalized sync idempotency) and the reporting queries.
 */

type Modules = {
  client: typeof import("@/lib/db/client");
  migrate: typeof import("@/lib/db/migrate");
  users: typeof import("@/lib/db/users");
  sessions: typeof import("@/lib/db/auth-sessions");
  quizzes: typeof import("@/lib/db/quizzes");
  persistence: typeof import("@/lib/db/session-persistence");
  reports: typeof import("@/lib/db/reports");
  errors: typeof import("@/lib/db/errors");
  password: typeof import("@/lib/auth/password");
  ids: typeof import("@/lib/db/ids");
};

/** Quiz content as the engine plays it (no ids / timestamps). */
function content(q: Quiz) {
  return {
    title: q.title,
    description: q.description,
    course: q.course,
    topic: q.topic,
    difficulty: q.difficulty,
    language: q.language,
    visibility: q.visibility,
    mode: q.mode,
    questions: q.questions.map((x) => ({
      type: x.type,
      prompt: x.prompt,
      description: x.description,
      explanation: x.explanation,
      mediaUrl: x.mediaUrl,
      timeLimit: x.timeLimit,
      points: x.points,
      topic: x.topic,
      learningOutcome: x.learningOutcome,
      acceptedAnswers: x.acceptedAnswers,
      numeric: x.numeric,
      answers: x.answers.map((a) => ({ text: a.text, isCorrect: a.isCorrect, position: a.position })),
    })),
  };
}

function allTypesQuiz(): Quiz {
  const q = buildQuiz([
    question("single", {
      id: "q-single",
      description: "Konteks",
      explanation: "Karena FIFO",
      mediaUrl: "/api/media/a.webp",
    }),
    question("multiple", { id: "q-multi", learningOutcome: "LO2" }),
    question("true_false", { id: "q-tf" }),
    question("short_answer", { id: "q-short" }),
    question("poll", { id: "q-poll", points: 0 }),
    question("ordering", { id: "q-order" }),
    question("numeric", { id: "q-num" }),
  ]);
  return {
    ...q,
    id: "draft-all-types",
    description: "Semua tipe soal",
    topic: "Campuran",
    course: { ...q.course, className: "LA01", lecturer: "Laras", learningOutcome: "LO1" },
  };
}

describe.skipIf(!TEST_DATABASE_URL)("Postgres integration: schema, accounts, quizzes, sessions", () => {
  let m: Modules;
  let drop: (() => Promise<void>) | null = null;
  let ownerA = "";
  let ownerB = "";

  beforeAll(async () => {
    const created = await createTestDatabase("core");
    drop = created.drop;
    process.env.DATABASE_URL = created.url;
    vi.resetModules();
    m = {
      client: await import("@/lib/db/client"),
      migrate: await import("@/lib/db/migrate"),
      users: await import("@/lib/db/users"),
      sessions: await import("@/lib/db/auth-sessions"),
      quizzes: await import("@/lib/db/quizzes"),
      persistence: await import("@/lib/db/session-persistence"),
      reports: await import("@/lib/db/reports"),
      errors: await import("@/lib/db/errors"),
      password: await import("@/lib/auth/password"),
      ids: await import("@/lib/db/ids"),
    };
  }, 60_000);

  afterAll(async () => {
    await m?.client.closeDb();
    await drop?.();
    delete process.env.DATABASE_URL;
  });

  const sql = async <T extends Record<string, unknown>>(text: string, params: unknown[] = []) =>
    (await m.client.getPool()!.query<T>(text, params)).rows;

  /* ---------------------------------------------------------------- */

  describe("migrations", () => {
    it("apply cleanly on an empty database and are idempotent", async () => {
      await m.migrate.runMigrations();
      const tables = (
        await sql<{ table_name: string }>(
          "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
        )
      ).map((r) => r.table_name);
      expect(tables).toEqual([
        "answers",
        "auth_sessions",
        "game_sessions",
        "leaderboard_snapshots",
        "media",
        "player_answers",
        "players",
        "questions",
        "quizzes",
        "session_events",
        "users",
      ]);
      const applied = await sql<{ n: number }>("select count(*)::int as n from drizzle.__drizzle_migrations");
      await m.migrate.runMigrations();
      expect(await sql<{ n: number }>("select count(*)::int as n from drizzle.__drizzle_migrations")).toEqual(applied);
      await expect(m.client.checkDb()).resolves.toBe(true);
    });

    it("enforces the partial unique index on live room codes", async () => {
      const indexes = await sql<{ indexdef: string }>(
        "select indexdef from pg_indexes where indexname = 'game_sessions_active_room_code'",
      );
      expect(indexes[0]?.indexdef).toMatch(/UNIQUE INDEX .* \(room_code\) WHERE \(status = ANY/);
    });
  });

  /* ---------------------------------------------------------------- */

  describe("users", () => {
    it("creates accounts with lowercase emails and scrypt hashes", async () => {
      expect(await m.users.countUsers()).toBe(0);
      const admin = await m.users.createUser({
        email: "  Admin@Binus.EDU ",
        password: "admin-sandi-1",
        fullName: "Admin Kampus",
        role: "admin",
      });
      const lecturer = await m.users.createUser({
        email: "laras@binus.edu",
        password: "laras-sandi-1",
        fullName: "Laras Wicaksono",
        salutation: "Bu",
      });
      ownerA = lecturer.id;
      ownerB = admin.id;
      expect(admin.email).toBe("admin@binus.edu");
      expect(admin).not.toHaveProperty("passwordHash");
      expect(lecturer.role).toBe("lecturer");
      expect(lecturer.locale).toBe("id");
      expect(await m.users.countUsers()).toBe(2);

      const found = await m.users.findUserByEmail("ADMIN@binus.edu");
      expect(found?.id).toBe(admin.id);
      expect(found?.passwordHash.startsWith("scrypt$16384$8$1$")).toBe(true);
      await expect(m.password.verifyPassword("admin-sandi-1", found!.passwordHash)).resolves.toBe(true);
      expect(await m.users.findUserByEmail("nobody@binus.edu")).toBeNull();
      expect(await m.users.getUserById("not-a-uuid")).toBeNull();
      expect((await m.users.getUserById(lecturer.id))?.fullName).toBe("Laras Wicaksono");
    });

    it("rejects a duplicate email with a unique violation", async () => {
      const err = await m.users
        .createUser({ email: "LARAS@binus.edu", password: "x".repeat(8), fullName: "Dup" })
        .catch((e: unknown) => e);
      expect(m.errors.isUniqueViolation(err)).toBe(true);
    });

    it("keeps emails lowercase even for raw writes", async () => {
      await expect(
        sql("insert into users (email, password_hash, full_name) values ('Upper@Binus.edu', 'x', 'X')"),
      ).rejects.toThrow(/users_email_lowercase/);
    });

    it("lists admins first and counts active admins", async () => {
      const list = await m.users.listUsers();
      expect(list.map((u) => u.role)).toEqual(["admin", "lecturer"]);
      expect(await m.users.countActiveAdmins()).toBe(1);
    });
  });

  /* ---------------------------------------------------------------- */

  describe("auth sessions", () => {
    const hash = (n: number) => n.toString(16).padStart(64, "0");

    it("stores token hashes and finds the user behind one", async () => {
      await m.sessions.insertAuthSession({
        userId: ownerA,
        tokenHash: hash(1),
        expiresAt: new Date(Date.now() + 60_000),
        userAgent: "Vitest",
      });
      const found = await m.sessions.findAuthSession(hash(1));
      expect(found?.user.id).toBe(ownerA);
      expect(found?.user.email).toBe("laras@binus.edu");
      expect(await m.sessions.findAuthSession(hash(2))).toBeNull();

      const before = found!.session.lastSeenAt.getTime();
      await m.sessions.touchAuthSession(found!.session.id, new Date(before + 10 * 60_000));
      expect((await m.sessions.findAuthSession(hash(1)))!.session.lastSeenAt.getTime()).toBe(before + 10 * 60_000);

      await m.sessions.deleteAuthSession(hash(1));
      expect(await m.sessions.findAuthSession(hash(1))).toBeNull();
    });

    it("purges only expired sessions", async () => {
      await m.sessions.insertAuthSession({
        userId: ownerA,
        tokenHash: hash(3),
        expiresAt: new Date(Date.now() - 1000),
      });
      await m.sessions.insertAuthSession({
        userId: ownerA,
        tokenHash: hash(4),
        expiresAt: new Date(Date.now() + 60_000),
      });
      expect(await m.sessions.purgeExpiredAuthSessions()).toBe(1);
      expect(await m.sessions.findAuthSession(hash(3))).toBeNull();
      expect(await m.sessions.findAuthSession(hash(4))).not.toBeNull();
    });

    it("revokes every session when a password is reset or an account disabled", async () => {
      await m.sessions.insertAuthSession({
        userId: ownerA,
        tokenHash: hash(5),
        expiresAt: new Date(Date.now() + 60_000),
      });
      expect(await m.users.setUserPassword(ownerA, "sandi-baru-123")).toBe(true);
      expect(await m.sessions.findAuthSession(hash(4))).toBeNull();
      expect(await m.sessions.findAuthSession(hash(5))).toBeNull();
      const user = await m.users.findUserByEmail("laras@binus.edu");
      await expect(m.password.verifyPassword("sandi-baru-123", user!.passwordHash)).resolves.toBe(true);
      await expect(m.password.verifyPassword("laras-sandi-1", user!.passwordHash)).resolves.toBe(false);

      await m.sessions.insertAuthSession({
        userId: ownerA,
        tokenHash: hash(6),
        expiresAt: new Date(Date.now() + 60_000),
      });
      const disabled = await m.users.updateUser(ownerA, { disabled: true });
      expect(disabled?.disabled).toBe(true);
      expect(await m.sessions.findAuthSession(hash(6))).toBeNull();
      const enabled = await m.users.updateUser(ownerA, {
        disabled: false,
        fullName: " Laras W. ",
        lastLoginAt: new Date(),
      });
      expect(enabled?.fullName).toBe("Laras W.");
      expect(enabled?.lastLoginAt).toBeInstanceOf(Date);
      expect(await m.users.updateUser("00000000-0000-4000-8000-00000000dead", { disabled: true })).toBeNull();
      expect(await m.users.setUserPassword("nope", "x".repeat(8))).toBe(false);
    });
  });

  /* ---------------------------------------------------------------- */

  describe("quizzes", () => {
    let savedId = "";

    it("round-trips every question type, including type-specific metadata", async () => {
      const input = allTypesQuiz();
      const saved = await m.quizzes.saveQuiz(input, ownerA);
      savedId = saved.id;
      expect(saved.id).toBe(m.ids.stableUuid(`quiz:${ownerA}:draft-all-types`));
      expect(saved.ownerId).toBe(ownerA);
      expect(content(saved)).toEqual(content(input));
      expect(saved.questions.every((q) => m.errors.isUuid(q.id))).toBe(true);
      expect(saved.questions.flatMap((q) => q.answers).every((a) => m.errors.isUuid(a.id))).toBe(true);
      expect(saved.questions.find((q) => q.type === "numeric")?.numeric).toEqual({
        value: 42,
        tolerance: 0.5,
        unit: "ms",
      });
      expect(saved.questions.find((q) => q.type === "short_answer")?.acceptedAnswers).toEqual(["Round Robin", "RR"]);

      const loaded = await m.quizzes.getQuiz(saved.id, ownerA);
      expect(loaded).toEqual(saved);
      // Readable ids resolve to the same row for the same owner.
      expect((await m.quizzes.getQuiz("draft-all-types", ownerA))?.id).toBe(saved.id);
    });

    it("keeps row ids stable when the stored quiz is saved again", async () => {
      const first = (await m.quizzes.getQuiz(savedId, ownerA))!;
      const edited: Quiz = {
        ...first,
        title: "Semua tipe (revisi)",
        questions: [first.questions[1]!, first.questions[0]!, ...first.questions.slice(2)],
      };
      const second = await m.quizzes.saveQuiz(edited, ownerA);
      expect(second.id).toBe(first.id);
      expect(second.title).toBe("Semua tipe (revisi)");
      expect(second.questions.map((q) => q.id)).toEqual(edited.questions.map((q) => q.id));
      expect(second.questions.map((q) => q.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(second.questions[1]!.answers.map((a) => a.id)).toEqual(first.questions[0]!.answers.map((a) => a.id));
      expect(second.createdAt).toBe(first.createdAt);
      expect(Date.parse(second.updatedAt)).toBeGreaterThanOrEqual(Date.parse(first.updatedAt));

      // Retrying the original draft save updates the same row instead of duplicating it.
      await m.quizzes.saveQuiz(allTypesQuiz(), ownerA);
      expect((await m.quizzes.listQuizzes(ownerA)).filter((q) => q.id === savedId)).toHaveLength(1);
    });

    it("snaps time limits to the presets and clamps points", async () => {
      const q = buildQuiz([
        question("single", { id: "t1", timeLimit: 25, points: 20_000 }),
        question("single", { id: "t2", timeLimit: 7, points: -5 }),
        question("single", { id: "t3", timeLimit: 200 }),
      ]);
      const saved = await m.quizzes.saveQuiz({ ...q, id: "timing" }, ownerA);
      expect(saved.questions.map((x) => x.timeLimit)).toEqual([30, 5, 120]);
      expect(saved.questions.map((x) => x.points)).toEqual([10_000, 0, 1000]);
      expect(m.quizzes.snapTimeLimit(20)).toBe(20);
    });

    it("imports the seed quizzes and lists them with question counts", async () => {
      for (const seed of SEED_QUIZZES) await m.quizzes.saveQuiz(seed, ownerA);
      const list = await m.quizzes.listQuizzes(ownerA);
      expect(list).toHaveLength(2 + SEED_QUIZZES.length);
      const os = list.find((q) => q.title === SEED_QUIZZES[0]!.title)!;
      expect(os.questionCount).toBe(SEED_QUIZZES[0]!.questions.length);
      expect(os.courseCode).toBe("COMP6716");
      expect(list.find((q) => q.id === savedId)?.questionCount).toBe(7);
      // Newest first.
      const times = list.map((q) => Date.parse(q.updatedAt));
      expect([...times].sort((a, b) => b - a)).toEqual(times);
      const osBattle = await m.quizzes.getQuiz("os-battle", ownerA);
      expect(osBattle && content(osBattle)).toEqual(content(SEED_QUIZZES[0]!));
    });

    it("scopes everything to the owner", async () => {
      expect(await m.quizzes.getQuiz(savedId, ownerB)).toBeNull();
      expect(await m.quizzes.listQuizzes(ownerB)).toEqual([]);
      expect(await m.quizzes.deleteQuiz(savedId, ownerB)).toBe(false);
      const theirs = (await m.quizzes.getQuiz(savedId, ownerA))!;
      await expect(m.quizzes.saveQuiz(theirs, ownerB)).rejects.toBeInstanceOf(m.quizzes.QuizOwnershipError);

      // Reusing another quiz's question/answer uuids never touches that quiz.
      const copy = await m.quizzes.saveQuiz({ ...theirs, id: "copy-of-theirs" }, ownerB);
      expect(copy.questions.map((q) => q.id)).not.toEqual(theirs.questions.map((q) => q.id));
      expect(await m.quizzes.getQuiz(savedId, ownerA)).toEqual(theirs);
      expect(await m.quizzes.getQuiz("x", "not-a-uuid")).toBeNull();
    });

    it("deletes a quiz with its questions and answers", async () => {
      const q = await m.quizzes.saveQuiz({ ...allTypesQuiz(), id: "to-delete" }, ownerA);
      expect(await m.quizzes.deleteQuiz(q.id, ownerA)).toBe(true);
      expect(await m.quizzes.getQuiz(q.id, ownerA)).toBeNull();
      expect(await m.quizzes.deleteQuiz(q.id, ownerA)).toBe(false);
      const orphans = await sql<{ n: number }>("select count(*)::int as n from questions where quiz_id = $1", [q.id]);
      expect(orphans[0]!.n).toBe(0);
      expect(await m.quizzes.countQuizzes(ownerA)).toBe(2 + SEED_QUIZZES.length);
    });
  });

  /* ---------------------------------------------------------------- */

  describe("session persistence and reports", () => {
    let GameAuthority: typeof GameAuthorityType;
    let GameEngine: typeof import("@/lib/game/engine").GameEngine;
    let stored: Quiz;
    const authorities: GameAuthorityType[] = [];

    beforeAll(async () => {
      ({ GameAuthority } = await import("@/lib/realtime/authority"));
      ({ GameEngine } = await import("@/lib/game/engine"));
      const q = buildQuiz([
        question("single", { id: "s1" }),
        question("poll", { id: "s2" }),
        question("single", { id: "s3" }),
      ]);
      stored = await m.quizzes.saveQuiz({ ...q, id: "session-quiz", title: "Sesi Uji" }, ownerA);
    });

    afterAll(() => {
      for (const a of authorities) a.dispose();
    });

    function newSession(sessionId: string, roomCode: string, ttlMs?: number) {
      const engine = GameEngine.create({
        sessionId,
        roomCode,
        hostName: "Bu Laras",
        quiz: stored,
        now: Date.now(),
        ttlMs,
      });
      const authority = new GameAuthority(
        { engine: engine.serialize(), tokens: {} },
        { onEvent: () => undefined, autoCloseWhenAllAnswered: false },
      );
      authorities.push(authority);
      const meta = { hostId: ownerA, quizId: stored.id, createdAt: Date.now() };
      const record = () => ({ sessionId, persisted: authority.persisted(), meta });
      return { authority, record };
    }

    const count = async (table: string, sessionId: string) =>
      (await sql<{ n: number }>(`select count(*)::int as n from ${table} where session_id = $1`, [sessionId]))[0]!.n;

    const SESSION = "5b1f4c52-6f0b-4bb5-9a51-6f1d2c3b4a01";
    let players: PlayerCredentials[] = [];

    it("writes a new lobby with hashed tokens and the quiz stored once", async () => {
      const p = new m.persistence.PostgresSessionPersistence();
      const { authority, record } = newSession(SESSION, "731594");
      players = ["Andi", "Budi", "Citra"].map((nickname) => {
        const res = authority.join({ nickname, avatarSeed: nickname });
        if (!res.ok) throw new Error(res.error);
        return res.credentials;
      });
      await p.save(record());

      const [row] = await sql<{
        status: string;
        quiz_id: string;
        host_id: string;
        room_code: string;
        engine_state: { engine: Record<string, unknown>; tokens: Record<string, string> };
        quiz_snapshot: Quiz;
      }>("select * from game_sessions where id = $1", [SESSION]);
      expect(row).toMatchObject({ status: "lobby", quiz_id: stored.id, host_id: ownerA, room_code: "731594" });
      expect(row!.engine_state.engine).not.toHaveProperty("quiz");
      expect(row!.quiz_snapshot).toEqual(stored);
      const tokens = Object.values(row!.engine_state.tokens);
      expect(tokens).toHaveLength(3);
      for (const token of tokens) expect(token).toMatch(/^[0-9a-f]{64}$/);
      for (const cred of players) expect(JSON.stringify(row)).not.toContain(cred.token);
      expect(await count("session_events", SESSION)).toBe(1);
      expect(await count("players", SESSION)).toBe(0);

      expect(await p.isRoomCodeTaken("731594")).toBe(true);
      expect(await p.isRoomCodeTaken("731595")).toBe(false);

      const active = await p.loadActive();
      const restored = active.find((r) => r.sessionId === SESSION)!;
      expect(restored.meta).toEqual(record().meta);
      expect(restored.persisted).toEqual(record().persisted);
      // A restored authority accepts the players' original tokens.
      const again = new GameAuthority(restored.persisted, { onEvent: () => undefined });
      authorities.push(again);
      expect(again.verify(players[0]!)).toBe(true);
    });

    it("syncs players, answers and the leaderboard on reveal, idempotently", async () => {
      const p = new m.persistence.PostgresSessionPersistence();
      const { authority, record } = newSession(SESSION, "731594");
      players = ["Andi", "Budi", "Citra"].map((nickname) => {
        const res = authority.join({ nickname, avatarSeed: nickname });
        if (!res.ok) throw new Error(res.error);
        return res.credentials;
      });
      // Re-create the lobby row for this authority (fresh player ids), then play Q1.
      await sql("delete from game_sessions where id = $1", [SESSION]);
      await p.save(record());
      expect(authority.start().ok).toBe(true);
      await p.save(record());
      expect(authority.publishQuestion().ok).toBe(true);
      await p.save(record());
      const q1 = authority.engine.currentQuestion!;
      const right = q1.answers.find((a) => a.isCorrect)!.id;
      const wrong = q1.answers.find((a) => !a.isCorrect)!.id;
      expect(authority.submit(players[0]!, q1.id, { kind: "choice", answerIds: [right] }).status).toBe("accepted");
      expect(authority.submit(players[1]!, q1.id, { kind: "choice", answerIds: [right] }).status).toBe("accepted");
      expect(authority.submit(players[2]!, q1.id, { kind: "choice", answerIds: [wrong] }).status).toBe("accepted");
      await p.save(record());
      expect(await count("player_answers", SESSION)).toBe(0); // not before the reveal
      expect(authority.closeQuestion().ok).toBe(true);
      await p.save(record());

      expect(await count("players", SESSION)).toBe(3);
      expect(await count("player_answers", SESSION)).toBe(3);
      expect(await count("leaderboard_snapshots", SESSION)).toBe(1);
      expect(await count("session_events", SESSION)).toBe(4); // lobby, intro, question, reveal
      const answers = await sql<{ is_correct: boolean; points_awarded: number; answer_id: string }>(
        "select is_correct, points_awarded, answer_id from player_answers where session_id = $1 order by is_correct",
        [SESSION],
      );
      expect(answers.map((a) => a.is_correct)).toEqual([false, true, true]);
      expect(answers[0]!.points_awarded).toBe(0);
      expect(answers[2]!.points_awarded).toBeGreaterThan(0);
      expect(answers.map((a) => a.answer_id).sort()).toEqual([right, right, wrong].sort());

      // Same state again, from a fresh instance (as after a restart): no duplicates.
      const restarted = new m.persistence.PostgresSessionPersistence();
      await restarted.save(record());
      await restarted.save(record());
      expect(await count("players", SESSION)).toBe(3);
      expect(await count("player_answers", SESSION)).toBe(3);
      expect(await count("leaderboard_snapshots", SESSION)).toBe(1);
      expect(await count("session_events", SESSION)).toBe(4);

      // Burst of saves: written in order, coalesced to the newest state.
      expect(authority.publishLeaderboard().ok).toBe(true);
      const burst = [p.save(record()), p.save(record()), p.save(record())];
      authority.setLeaderboardVisible(false);
      burst.push(p.save(record()));
      await Promise.all(burst);
      await p.flush();
      const [latest] = await sql<{ engine_state: { engine: { phase: string; showLeaderboard: boolean } } }>(
        "select engine_state from game_sessions where id = $1",
        [SESSION],
      );
      expect(latest!.engine_state.engine.phase).toBe("leaderboard");
      expect(latest!.engine_state.engine.showLeaderboard).toBe(false);
      expect(await count("session_events", SESSION)).toBe(5);

      // Q2 is a poll, then the game finishes.
      expect(authority.next().ok).toBe(true);
      expect(authority.publishQuestion().ok).toBe(true);
      const q2 = authority.engine.currentQuestion!;
      for (const cred of players) authority.submit(cred, q2.id, { kind: "choice", answerIds: [q2.answers[0]!.id] });
      expect(authority.closeQuestion().ok).toBe(true);
      await p.save(record());
      expect(authority.finish().ok).toBe(true);
      await p.save(record());

      const [done] = await sql<{ status: string; ended_at: Date | null; current_question: number }>(
        "select status, ended_at, current_question from game_sessions where id = $1",
        [SESSION],
      );
      expect(done).toMatchObject({ status: "finished", current_question: 1 });
      expect(done!.ended_at).toBeInstanceOf(Date);
      expect(await count("player_answers", SESSION)).toBe(6);
      expect(await count("leaderboard_snapshots", SESSION)).toBe(2);
      expect((await p.loadActive()).some((r) => r.sessionId === SESSION)).toBe(false);
      // A finished room releases its PIN.
      expect(await p.isRoomCodeTaken("731594")).toBe(false);

      // Reports: 2 of 3 correct on the only revealed scored question; the poll is excluded.
      const list = await m.reports.listHostSessions(ownerA);
      const item = list.find((s) => s.id === SESSION)!;
      expect(item).toMatchObject({
        quizId: stored.id,
        quizTitle: "Sesi Uji",
        courseCode: "COMP6716",
        roomCode: "731594",
        status: "finished",
        players: 3,
      });
      expect(item.accuracy).toBeCloseTo(2 / 3, 5);
      expect(item.startedAt).not.toBeNull();
      expect(item.endedAt).not.toBeNull();
      expect(await m.reports.listHostSessions(ownerB)).toEqual([]);

      const state = await m.reports.getSessionEngineState(SESSION, ownerA);
      expect(state).toEqual(authority.engine.serialize());
      expect(await m.reports.getSessionEngineState(SESSION, ownerB)).toBeNull();
      expect(await m.reports.getSessionEngineState("missing", ownerA)).toBeNull();
    });

    it("keeps the quiz snapshot when the quiz is deleted", async () => {
      await m.quizzes.saveQuiz({ ...stored, id: "session-quiz-copy" }, ownerA);
      const copy = (await m.quizzes.getQuiz("session-quiz-copy", ownerA))!;
      const { authority, record } = newSession("6c2a5d63-7a1c-4cc6-8b62-7a2e3d4c5b02", "284617");
      const r = record();
      await new m.persistence.PostgresSessionPersistence().save({ ...r, meta: { ...r.meta, quizId: copy.id } });
      await m.quizzes.deleteQuiz(copy.id, ownerA);
      const [row] = await sql<{ quiz_id: string | null }>("select quiz_id from game_sessions where id = $1", [
        authority.sessionId,
      ]);
      expect(row!.quiz_id).toBeNull();
      expect(await m.reports.getSessionEngineState(authority.sessionId, ownerA)).not.toBeNull();
    });

    it("releases the PIN of an expired room and never restores it", async () => {
      const p = new m.persistence.PostgresSessionPersistence();
      const { record } = newSession("7d3b6e74-8b2d-4dd7-9c73-8b3f4e5d6c03", "915372", -1000);
      await p.save(record());
      expect(await p.isRoomCodeTaken("915372")).toBe(false);
      const [row] = await sql<{ status: string }>("select status from game_sessions where id = $1", [
        record().sessionId,
      ]);
      expect(row!.status).toBe("ended");
      expect((await p.loadActive()).some((x) => x.sessionId === record().sessionId)).toBe(false);
    });

    it("never stores the shared demo or sessions of non-database hosts", async () => {
      const p = new m.persistence.PostgresSessionPersistence();
      const demo = newSession("demo", "482913");
      await p.save(demo.record());
      const local = newSession("8e4c7f85-9c3e-4ee8-8d84-9c4f5e6d7d04", "551234");
      const r = local.record();
      await p.save({ ...r, meta: { ...r.meta, hostId: "local-demo-lecturer" } });
      // A uuid that is not a user: the write fails inside the adapter and is only logged.
      const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
      await expect(
        p.save({ ...r, meta: { ...r.meta, hostId: "00000000-0000-4000-8000-000000000001" } }),
      ).resolves.toBeUndefined();
      expect(errors).toHaveBeenCalled();
      errors.mockRestore();
      const rows = await sql<{ id: string }>("select id from game_sessions where id = any($1)", [
        ["demo", r.sessionId],
      ]);
      expect(rows).toEqual([]);
    });

    it("maps engine phases to stored statuses", () => {
      const s = m.persistence.statusForPhase;
      expect(
        ["lobby", "intro", "question", "reveal", "leaderboard", "finished", "ended"].map((x) => s(x as never)),
      ).toEqual(["lobby", "running", "running", "running", "running", "finished", "ended"]);
    });
  });
});
