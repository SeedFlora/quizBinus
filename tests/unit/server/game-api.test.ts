import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Quiz, SessionSnapshot } from "@/lib/game/types";
import type { JoinResult, RoomLookup } from "@/lib/realtime/types";

vi.mock("server-only", () => ({}));

/** Flip between memory mode and database mode per test. */
const env = vi.hoisted(() => ({ database: false }));
vi.mock("@/lib/env.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env.server")>()),
  isDatabaseConfigured: () => env.database,
}));
// Route handlers resolve the lecturer from cookies; these tests pass identities directly.
vi.mock("@/lib/auth/lecturer", () => ({ getLecturerOrNull: vi.fn(async () => null) }));
const stored = vi.hoisted(() => ({ quizzes: new Map<string, { quiz: unknown; ownerId: string }>() }));
vi.mock("@/lib/db/quizzes", () => ({
  getQuiz: vi.fn(async (id: string, ownerId: string) => {
    const row = stored.quizzes.get(id);
    return row && row.ownerId === ownerId ? row.quiz : null;
  }),
}));
vi.mock("@/lib/db/reports", () => ({
  listHostSessions: vi.fn(async () => []),
  getSessionEngineState: vi.fn(async () => null),
}));

import {
  createSession,
  ensureDemoSession,
  hostCommand,
  hostState,
  joinRoom,
  listSessions,
  lookupRoom,
  playerAction,
  sessionReport,
  submitAnswer,
} from "@/lib/server/game-api";
import { getGameRuntime, memoryPersistence, type SessionPersistence } from "@/lib/server/game-runtime";
import { HOST_KEY_COOKIE } from "@/lib/server/host-auth";
import { hashToken } from "@/lib/security/token";
import { DEMO_ROOM_CODE } from "@/lib/demo/simulate";
import { deepKeys } from "../../fixtures/quiz";
import { dbHost, jsonRequest, memoryHost, resetServer, testQuiz } from "./helpers";

const IP = "10.0.0.7";

async function create(quiz: Quiz = testQuiz(), host = memoryHost()) {
  const res = await createSession(host, { quizId: quiz.id, quiz }, jsonRequest("/api/sessions", {}), IP);
  expect(res.status).toBe(201);
  const body = res.body as { sessionId: string; roomCode: string };
  // Memory mode: the creating browser receives the host key; only its hash is kept.
  const cookie = res.headers?.["Set-Cookie"] ?? "";
  const key = cookie.match(new RegExp(`^${HOST_KEY_COOKIE}=([^;]+)`))?.[1] ?? null;
  const owner = key ? memoryHost(hashToken(key)) : host;
  return { ...body, cookie, key, owner };
}

function join(roomCode: string, nickname: string) {
  const res = joinRoom(roomCode, { nickname, avatarSeed: `seed-${nickname}` }, IP);
  const body = res.body as JoinResult;
  if (!body.ok) throw new Error(`join ${nickname}: ${body.error}`);
  return body.credentials;
}

const auth = (c: { playerId: string; token: string }) => ({ playerId: c.playerId, token: c.token });
const snap = (res: { body: unknown }) => (res.body as { snapshot: SessionSnapshot }).snapshot;

beforeEach(() => {
  env.database = false;
  stored.quizzes.clear();
  resetServer();
});

afterEach(() => {
  resetServer();
  getGameRuntime().usePersistence(memoryPersistence);
  vi.useRealTimers();
});

/* ------------------------------------------------------------------ */

describe("game API: a full round in memory mode", () => {
  it("create → lookup → join → answer (accepted, duplicate, late) → reveal → finish → summary", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    const { sessionId, roomCode, cookie, owner } = await create();
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api/);
    expect(roomCode).toMatch(/^[1-9]\d{5}$/);
    expect(roomCode).not.toBe(DEMO_ROOM_CODE);

    const lookup = lookupRoom(roomCode, IP);
    expect(lookup.status).toBe(200);
    expect(lookup.body).toMatchObject({ status: "ok", sessionId, quizTitle: "Kuis Uji", playerCount: 0 });
    expect(lookupRoom("111111", IP)).toEqual({ status: 404, body: { status: "not_found" }, headers: undefined });

    const rara = join(roomCode, "Rara");
    expect(rara.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const twin = joinRoom(roomCode, { nickname: "rara", avatarSeed: "x" }, IP);
    expect(twin.status).toBe(409);
    expect(twin.body).toEqual({ ok: false, error: "nickname_taken" });
    expect(joinRoom(roomCode, { nickname: "x", avatarSeed: "x" }, IP).status).toBe(422);
    const bima = join(roomCode, "Bima");
    expect((lookupRoom(roomCode, IP).body as Extract<RoomLookup, { status: "ok" }>).playerCount).toBe(2);

    expect(snap(hostCommand(sessionId, owner, { command: "start" })).phase).toBe("intro");
    const open = hostCommand(sessionId, owner, { command: "publishQuestion" });
    expect(snap(open).phase).toBe("question");
    // The open question never carries correctness.
    const keys = deepKeys(snap(open));
    expect(keys.has("isCorrect")).toBe(false);
    expect(keys.has("correctAnswerIds")).toBe(false);

    const quiz = testQuiz();
    const right = quiz.questions[0]!.answers.find((a) => a.isCorrect)!.id;
    const answer = (c: typeof rara, answerId = right) =>
      submitAnswer(sessionId, { ...auth(c), questionId: "q1", payload: { kind: "choice", answerIds: [answerId] } });

    const accepted = answer(rara);
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({ status: "accepted" });
    expect(answer(rara)).toMatchObject({ status: 409, body: { status: "duplicate" } });

    // Past the deadline + grace (server clock only): late.
    vi.setSystemTime(Date.now() + 20_000 + 800);
    expect(answer(bima)).toMatchObject({ status: 409, body: { status: "late" } });

    const reveal = snap(hostCommand(sessionId, owner, { command: "closeQuestion" }));
    expect(reveal.phase).toBe("reveal");
    expect(reveal.reveal?.results[rara.playerId]).toMatchObject({ isCorrect: true });
    expect(reveal.reveal?.results[bima.playerId]).toMatchObject({ answered: false });
    // A second close is a harmless conflict.
    expect(hostCommand(sessionId, owner, { command: "closeQuestion" })).toMatchObject({
      status: 409,
      body: { ok: false, error: "invalid_phase" },
    });

    const mine = playerAction(sessionId, { action: "snapshot", ...auth(rara) });
    expect((mine.body as SessionSnapshot).self).toMatchObject({ playerId: rara.playerId, rank: 1 });
    expect((mine.body as SessionSnapshot).self!.score).toBeGreaterThan(0);

    expect(snap(hostCommand(sessionId, owner, { command: "publishLeaderboard" })).phase).toBe("leaderboard");
    expect(snap(hostCommand(sessionId, owner, { command: "next" })).phase).toBe("intro");
    expect(snap(hostCommand(sessionId, owner, { command: "finish" })).phase).toBe("finished");

    const summary = playerAction(sessionId, { action: "summary", ...auth(rara) });
    expect(summary.status).toBe(200);
    expect(summary.body).toMatchObject({ playerId: rara.playerId, rank: 1, correct: 1 });
    expect(playerAction(sessionId, { action: "summary", playerId: rara.playerId, token: "x".repeat(43) }).status).toBe(
      401,
    );

    // The PIN now reads as ended (still in memory for the players' summaries).
    expect(lookupRoom(roomCode, IP)).toMatchObject({ status: 410, body: { status: "ended" } });
    expect(joinRoom(roomCode, { nickname: "Late", avatarSeed: "l" }, IP).status).toBe(404);
  });

  it("host commands: lock/unlock, leaderboard visibility, kick, end", async () => {
    const { sessionId, roomCode, owner } = await create();
    join(roomCode, "Rara");
    const bima = join(roomCode, "Bima");

    expect(hostCommand(sessionId, owner, { command: "lock" }).status).toBe(200);
    expect(lookupRoom(roomCode, IP)).toMatchObject({ status: 423, body: { status: "locked" } });
    expect(joinRoom(roomCode, { nickname: "Citra", avatarSeed: "c" }, IP)).toMatchObject({
      status: 423,
      body: { ok: false, error: "locked" },
    });
    hostCommand(sessionId, owner, { command: "unlock" });
    expect(lookupRoom(roomCode, IP).status).toBe(200);

    expect(snap(hostCommand(sessionId, owner, { command: "hideLeaderboard" })).showLeaderboard).toBe(false);
    expect(snap(hostCommand(sessionId, owner, { command: "showLeaderboard" })).showLeaderboard).toBe(true);
    // Transitions out of order are refused, not applied.
    expect(hostCommand(sessionId, owner, { command: "publishLeaderboard" }).status).toBe(409);

    const kicked = hostCommand(sessionId, owner, { command: "kick", playerId: bima.playerId });
    expect(snap(kicked).players.map((p) => p.nickname)).toEqual(["Rara"]);
    expect(hostCommand(sessionId, owner, { command: "kick", playerId: "demo-p99" }).status).toBe(404);
    expect(playerAction(sessionId, { action: "resume", ...auth(bima) })).toMatchObject({
      status: 403,
      body: { ok: false, error: "kicked" },
    });
    hostCommand(sessionId, owner, { command: "start" });
    hostCommand(sessionId, owner, { command: "publishQuestion" });
    const kickedAnswer = submitAnswer(sessionId, {
      ...auth(bima),
      questionId: "q1",
      payload: { kind: "choice", answerIds: ["q1-a1"] },
    });
    expect(kickedAnswer.status).toBe(403);

    expect(snap(hostCommand(sessionId, owner, { command: "end" })).phase).toBe("ended");
    expect(lookupRoom(roomCode, IP).status).toBe(410);
  });

  it("resume returns the private self block; leaving the lobby frees the seat", async () => {
    const { roomCode, sessionId } = await create();
    const rara = join(roomCode, "Rara");
    const resumed = playerAction(sessionId, { action: "resume", ...auth(rara) });
    expect(resumed.status).toBe(200);
    expect(snap(resumed).self).toMatchObject({ playerId: rara.playerId, currentAnswer: null });
    expect(
      playerAction(sessionId, { action: "resume", playerId: rara.playerId, token: `${rara.token.slice(1)}x` }),
    ).toMatchObject({
      status: 401,
      body: { ok: false, error: "not_found" },
    });

    expect(playerAction(sessionId, { action: "leave", ...auth(rara) })).toMatchObject({
      status: 200,
      body: { ok: true },
    });
    expect((lookupRoom(roomCode, IP).body as Extract<RoomLookup, { status: "ok" }>).playerCount).toBe(0);
    // The nickname is free again.
    join(roomCode, "Rara");
    // Unknown session: nothing to resume.
    expect(playerAction("7d3b1c1e-9d7a-4f7e-8a57-2d7b4c1f0a11", { action: "resume", ...auth(rara) })).toMatchObject({
      status: 404,
      body: { ok: false, error: "ended" },
    });
  });
});

describe("game API: creating sessions", () => {
  it("memory mode hosts the inline quiz only when it matches quizId and is ready to play", async () => {
    const quiz = testQuiz();
    const req = jsonRequest("/api/sessions", {});
    expect(await createSession(memoryHost(), { quizId: quiz.id }, req, IP)).toMatchObject({
      status: 404,
      body: { error: "quiz_not_found" },
    });
    expect(await createSession(memoryHost(), { quizId: "other", quiz }, req, IP)).toMatchObject({ status: 404 });
    const empty = { ...quiz, questions: [] };
    expect(await createSession(memoryHost(), { quizId: quiz.id, quiz: empty }, req, IP)).toMatchObject({
      status: 422,
      body: { error: "quiz_not_ready" },
    });
  });

  it("reuses the browser's host key instead of minting a new one", async () => {
    const first = await create();
    const again = await createSession(
      first.owner,
      { quizId: "quiz-srv", quiz: testQuiz() },
      jsonRequest("/api/sessions", {}),
      IP,
    );
    expect(again.status).toBe(201);
    expect(again.headers?.["Set-Cookie"]).toBeUndefined();
  });

  it("database mode hosts the lecturer's stored quiz and ignores any inline copy", async () => {
    env.database = true;
    const lecturer = dbHost();
    const quiz = testQuiz();
    stored.quizzes.set(quiz.id, { quiz, ownerId: lecturer.id });
    const req = jsonRequest("/api/sessions", {});

    expect(await createSession(null, { quizId: quiz.id }, req, IP)).toMatchObject({ status: 401 });
    // Someone else's quiz id: not found for them, even with a quiz inline.
    expect(
      await createSession(dbHost("22222222-2222-4222-8222-222222222222"), { quizId: quiz.id, quiz }, req, IP),
    ).toMatchObject({
      status: 404,
    });
    const created = await createSession(lecturer, { quizId: quiz.id }, req, IP);
    expect(created.status).toBe(201);
    expect(created.headers?.["Set-Cookie"]).toBeUndefined(); // database mode: the auth cookie identifies the host
  });
});

describe("game API: who may host", () => {
  it("memory mode: only the browser holding the session's host key", async () => {
    const { sessionId, owner } = await create();
    expect(hostState(sessionId, owner).status).toBe(200);
    expect(hostState(sessionId, memoryHost())).toMatchObject({ status: 403, body: { error: "forbidden" } });
    expect(hostState(sessionId, memoryHost(hashToken("someone-elses-key-000000000000000000000000")))).toMatchObject({
      status: 403,
    });
    expect(hostCommand(sessionId, memoryHost(), { command: "end" }).status).toBe(403);
    expect(hostState("7d3b1c1e-9d7a-4f7e-8a57-2d7b4c1f0a11", owner).status).toBe(404);
  });

  it("database mode: 401 signed out, 403 for another lecturer, 200 for the host", async () => {
    env.database = true;
    const lecturer = dbHost();
    const quiz = testQuiz();
    stored.quizzes.set(quiz.id, { quiz, ownerId: lecturer.id });
    const created = (await createSession(lecturer, { quizId: quiz.id }, jsonRequest("/api/sessions", {}), IP)).body as {
      sessionId: string;
    };
    expect(hostState(created.sessionId, null)).toMatchObject({ status: 401, body: { error: "unauthorized" } });
    expect(
      hostCommand(created.sessionId, dbHost("22222222-2222-4222-8222-222222222222"), { command: "start" }),
    ).toMatchObject({
      status: 403,
    });
    expect(hostCommand(created.sessionId, lecturer, { command: "start" }).status).toBe(200);
    const report = await sessionReport(created.sessionId, lecturer);
    expect(report.status).toBe(200);
    // The host's report is the full engine state, correct answers included.
    expect(JSON.stringify(report.body)).toContain('"isCorrect":true');
    expect((await sessionReport(created.sessionId, null)).status).toBe(401);
  });

  it("the shared demo: anyone in memory mode, signed-in lecturers in database mode", async () => {
    await ensureDemoSession(IP);
    expect(hostState("demo", memoryHost()).status).toBe(200);
    expect(hostState("demo", null).status).toBe(200);
    env.database = true;
    expect(hostState("demo", null).status).toBe(401);
    expect(hostState("demo", dbHost()).status).toBe(200);
  });

  it("lists only the caller's own live sessions (never the demo)", async () => {
    const a = await create();
    await create(); // another browser, another key
    await ensureDemoSession(IP);
    const list = await listSessions(a.owner);
    expect((list.body as { id: string }[]).map((s) => s.id)).toEqual([a.sessionId]);
    expect(list.body).toEqual([
      expect.objectContaining({ id: a.sessionId, status: "lobby", players: 0, accuracy: null, quizTitle: "Kuis Uji" }),
    ]);
    env.database = true;
    expect((await listSessions(null)).status).toBe(401);
  });
});

describe("game API: the shared server demo", () => {
  it("is created once, fills with bots, is never persisted, and restarts after it ended", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const saved: string[] = [];
    const spy: SessionPersistence = {
      save: async (record) => void saved.push(record.sessionId),
      loadActive: async () => [],
      isRoomCodeTaken: async () => false,
    };
    getGameRuntime().usePersistence(spy);

    const [a, b] = await Promise.all([ensureDemoSession(IP), ensureDemoSession(IP)]);
    expect(a.body).toEqual({ sessionId: "demo", roomCode: DEMO_ROOM_CODE });
    expect(b.body).toEqual(a.body);
    expect(
      getGameRuntime()
        .list()
        .filter(([id]) => id === "demo"),
    ).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(10_000);
    const lookup = lookupRoom(DEMO_ROOM_CODE, IP).body as Extract<RoomLookup, { status: "ok" }>;
    expect(lookup.playerCount).toBeGreaterThan(5);

    // Ended: the PIN reads "not_found" (clients then fall back to the offline demo)…
    hostCommand("demo", memoryHost(), { command: "end" });
    expect(lookupRoom(DEMO_ROOM_CODE, IP)).toMatchObject({ status: 404, body: { status: "not_found" } });
    // …and the next projector gets a fresh demo.
    await ensureDemoSession(IP);
    expect(hostState("demo", memoryHost()).body).toMatchObject({ phase: "lobby" });

    // A class session is persisted; the demo never is.
    await create();
    expect(saved.length).toBeGreaterThan(0);
    expect(saved).not.toContain("demo");
  });
});

describe("game API: rate limits", () => {
  it("joins: 10 per minute per address", async () => {
    const { roomCode } = await create();
    const results = Array.from({ length: 11 }, (_, i) =>
      joinRoom(roomCode, { nickname: `Siswa ${i}`, avatarSeed: `s${i}` }, "10.9.9.9"),
    );
    expect(results.slice(0, 10).every((r) => r.status === 201)).toBe(true);
    expect(results[10]).toMatchObject({ status: 429, body: { ok: false, error: "rate_limited" } });
    // Another address is unaffected.
    expect(joinRoom(roomCode, { nickname: "Dewi", avatarSeed: "d" }, "10.9.9.10").status).toBe(201);
  });

  it("answers: 5 per 10 s per player", async () => {
    const { roomCode, sessionId, owner } = await create();
    const rara = join(roomCode, "Rara");
    hostCommand(sessionId, owner, { command: "start" });
    const statuses = Array.from(
      { length: 6 },
      () =>
        submitAnswer(sessionId, { ...auth(rara), questionId: "q1", payload: { kind: "choice", answerIds: ["q1-a1"] } })
          .status,
    );
    // Not open yet (intro) → 409 each time, and the 6th trips the limiter.
    expect(statuses).toEqual([409, 409, 409, 409, 409, 429]);
  });
});
