/**
 * Regression tests for the security review of the self-hosted server. Each block
 * names the attack it pins down; see the review notes in the PR/hand-over.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DrizzleQueryError } from "drizzle-orm";
import type { Question } from "@/lib/game/types";
import type { JoinResult, PlayerCredentials } from "@/lib/realtime/types";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/bootstrap", () => ({ ensureServerReady: async () => undefined }));
vi.mock("@/lib/auth/lecturer", async () => {
  const { DEMO_LECTURER } = await import("@/lib/seed/quizzes");
  // Memory mode: every caller is the demo lecturer; the host key cookie tells browsers apart.
  return {
    getLecturerOrNull: async () => ({
      id: DEMO_LECTURER.id,
      fullName: DEMO_LECTURER.fullName,
      salutation: "Bu",
      role: "lecturer",
      source: "demo",
    }),
  };
});

import { POST as eventsRoute } from "@/app/api/sessions/[id]/events/route";
import { GameEngine } from "@/lib/game/engine";
import { correctAnswerIds, toPublicQuestion } from "@/lib/game/evaluate";
import { LOGIN_RULES, LoginThrottle } from "@/lib/auth/login-throttle";
import { isProtectedPath, loginRedirectFor } from "@/lib/auth/proxy-rules";
import { describeError, loggableError } from "@/lib/db/errors";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { hashToken } from "@/lib/security/token";
import { SEED_QUIZZES } from "@/lib/seed/quizzes";
import { QuizSchema } from "@/lib/quiz/schema";
import { createSessionBodySchema, hostCommandBodySchema } from "@/lib/validation/api";
import { createSession, hostCommand, joinRoom, lookupRoom, playerAction, submitAnswer } from "@/lib/server/game-api";
import { getGameRuntime } from "@/lib/server/game-runtime";
import { HOST_KEY_COOKIE } from "@/lib/server/host-auth";
import { question, quiz } from "../../fixtures/quiz";
import { SseReader, ctx, jsonRequest, memoryHost, resetServer, testQuiz } from "../server/helpers";

const T0 = Date.UTC(2026, 8, 29, 1, 0, 0);

async function setup(q = testQuiz()) {
  const created = await createSession(
    memoryHost(),
    { quizId: q.id, quiz: q },
    jsonRequest("/api/sessions", {}),
    "10.1.0.1",
  );
  const { sessionId, roomCode } = created.body as { sessionId: string; roomCode: string };
  const key = created.headers!["Set-Cookie"]!.match(new RegExp(`^${HOST_KEY_COOKIE}=([^;]+)`))![1]!;
  const owner = memoryHost(hashToken(key));
  let n = 0;
  const joinAs = (nickname: string) => {
    const res = joinRoom(roomCode, { nickname, avatarSeed: nickname }, `10.2.0.${++n}`).body as JoinResult;
    if (!res.ok) throw new Error(res.error);
    return res.credentials;
  };
  return { sessionId, roomCode, key, owner, joinAs };
}

const creds = (c: PlayerCredentials) => ({ playerId: c.playerId, token: c.token });
const forged = (c: PlayerCredentials) => ({ playerId: c.playerId, token: "x".repeat(43) });

function openEvents(sessionId: string, body: unknown, headers: Record<string, string> = {}) {
  const abort = new AbortController();
  const request = jsonRequest(`/api/sessions/${sessionId}/events`, body, { signal: abort.signal, headers });
  return { abort, response: eventsRoute(request, ctx({ id: sessionId })) };
}

beforeEach(() => resetServer());
afterEach(() => resetServer());

/* ------------------------------------------------------------------ */

describe("ordering answers stay secret until the reveal", () => {
  const ordering = (): Question =>
    question("ordering", { id: "ord-secret", texts: ["New", "Ready", "Running", "Waiting", "Terminated"] });

  /**
   * The attack: the shuffle code ships to every phone. With the session id as the seed
   * (it is in the /play URL), a player replays the shuffle of [0..n-1] and inverts it.
   */
  function invertWithPublicSeed(shownIds: string[], q: Question, sessionId: string): string[] {
    const probe: Question = {
      ...q,
      answers: shownIds.map((_, i) => ({ id: String(i), position: i, text: "", isCorrect: false })),
    };
    const permutation = toPublicQuestion(probe, 0, 1, sessionId).answers.map((a) => Number(a.id));
    const solution: string[] = [];
    permutation.forEach((solutionIndex, slot) => (solution[solutionIndex] = shownIds[slot]!));
    return solution;
  }

  function openOrdering(shuffleSeed?: string) {
    const engine = GameEngine.create({
      sessionId: "0b7f4c8e-2d1a-4e6b-9c3f-5a8d7e6f1b2c",
      roomCode: "482100",
      hostName: "Bu Laras",
      quiz: quiz([ordering()]),
      now: T0,
      shuffleSeed,
    });
    engine.start(T0);
    engine.openQuestion(T0);
    return engine;
  }

  it("the public session id no longer predicts the shown order", () => {
    const engine = openOrdering("fixed-test-secret");
    const shown = engine.snapshotFor(T0).question!.answers.map((a) => a.id);
    const q = engine.state.quiz.questions[0]!;
    expect(invertWithPublicSeed(shown, q, engine.state.sessionId)).not.toEqual(correctAnswerIds(q));
  });

  it("gives every engine its own 128-bit secret seed, never sent to players", () => {
    const a = openOrdering();
    const b = openOrdering();
    expect(a.state.shuffleSeed).toMatch(/^[0-9a-f]{32}$/);
    expect(a.state.shuffleSeed).not.toBe(b.state.shuffleSeed);
    const snapshot = JSON.stringify(a.snapshotFor(T0, Object.keys(a.state.players)[0]));
    expect(snapshot).not.toContain(a.state.shuffleSeed!);
  });

  it("varies with the secret for one and the same session id", () => {
    const orders = new Set<string>();
    for (let i = 0; i < 30; i++) {
      orders.add(
        openOrdering(`secret-${i}`)
          .snapshotFor(T0)
          .question!.answers.map((a) => a.id)
          .join(),
      );
    }
    expect(orders.size).toBeGreaterThan(3);
  });

  it("is stable across snapshots and a persist/restore round trip", () => {
    const engine = openOrdering();
    const first = engine.snapshotFor(T0).question!.answers.map((a) => a.id);
    expect(engine.snapshotFor(T0 + 5).question!.answers.map((a) => a.id)).toEqual(first);
    const restored = GameEngine.restore(engine.serialize());
    expect(restored.snapshotFor(T0 + 9).question!.answers.map((a) => a.id)).toEqual(first);
  });

  it("still serves sessions saved before the secret existed", () => {
    const legacy = openOrdering().serialize();
    delete legacy.shuffleSeed;
    const shown = GameEngine.restore(legacy).snapshotFor(T0).question!;
    expect(shown.answers).toHaveLength(5);
  });

  it("seed quizzes never spell an ordering solution in their option ids", () => {
    const orderings = SEED_QUIZZES.flatMap((qz) => qz.questions).filter((q) => q.type === "ordering");
    expect(orderings.length).toBeGreaterThan(0);
    for (const q of orderings) {
      const solution = correctAnswerIds(q);
      expect([...solution].sort()).not.toEqual(solution);
      expect([...solution].sort().reverse()).not.toEqual(solution);
      for (const id of solution) expect(id).not.toMatch(/-a\d+$/);
    }
  });
});

/* ------------------------------------------------------------------ */

describe("player rate-limit buckets cannot be spent by a classmate", () => {
  it("forged answers with a victim's public player id do not block the victim", async () => {
    const { sessionId, owner, joinAs } = await setup();
    const victim = joinAs("Rara");
    joinAs("Bima");
    hostCommand(sessionId, owner, { command: "start" });
    hostCommand(sessionId, owner, { command: "publishQuestion" });
    const payload = { kind: "choice" as const, answerIds: ["q1-a1"] };

    for (let i = 0; i < RATE_LIMITS.answer.max + 2; i++) {
      const res = submitAnswer(sessionId, { ...forged(victim), questionId: "q1", payload });
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ status: "invalid", reason: "unauthorized" });
    }
    const real = submitAnswer(sessionId, { ...creds(victim), questionId: "q1", payload });
    expect(real).toMatchObject({ status: 200, body: { status: "accepted" } });
  });

  it("forged resume/snapshot requests do not lock the victim out", async () => {
    const { sessionId, joinAs } = await setup();
    const victim = joinAs("Rara");
    for (let i = 0; i < RATE_LIMITS.player.max + 2; i++) {
      expect(playerAction(sessionId, { action: "snapshot", ...forged(victim) }).status).toBe(401);
    }
    expect(playerAction(sessionId, { action: "resume", ...creds(victim) }).status).toBe(200);
  });

  it("forged stream requests do not use up the victim's reconnect budget", async () => {
    const { sessionId, joinAs } = await setup();
    const victim = joinAs("Rara");
    for (let i = 0; i < RATE_LIMITS.events.max + 2; i++) {
      expect((await openEvents(sessionId, forged(victim)).response).status).toBe(401);
    }
    const { abort, response } = openEvents(sessionId, creds(victim));
    expect((await response).status).toBe(200);
    abort.abort();
  });
});

/* ------------------------------------------------------------------ */

describe("server-wide room limits cannot be exhausted by one client", () => {
  it("a flood of wrong PINs (spoofed addresses) never locks out a real PIN", async () => {
    const { roomCode } = await setup();
    for (let i = 0; i < RATE_LIMITS.roomMisses.max; i++) lookupRoom("999999", `203.0.113.${i}`);
    // The guesser is now throttled server-wide…
    expect(lookupRoom("999998", "198.51.100.1").status).toBe(429);
    expect(joinRoom("999998", { nickname: "Tebak", avatarSeed: "t" }, "198.51.100.2").status).toBe(429);
    // …but students with the real PIN still get in.
    expect(lookupRoom(roomCode, "198.51.100.3").status).toBe(200);
    expect(joinRoom(roomCode, { nickname: "Dewi", avatarSeed: "d" }, "198.51.100.4").status).toBe(201);
  });

  it("join spam against one room leaves other rooms open", async () => {
    const a = await setup();
    const b = await setup({ ...testQuiz(), id: "quiz-b" });
    for (let i = 0; i < RATE_LIMITS.joinPerRoom.max; i++) {
      joinRoom(a.roomCode, { nickname: `Bot ${i}`, avatarSeed: "b" }, `203.0.113.${i}`);
    }
    expect(joinRoom(a.roomCode, { nickname: "Late", avatarSeed: "l" }, "198.51.100.9").status).toBe(429);
    expect(joinRoom(b.roomCode, { nickname: "Dewi", avatarSeed: "d" }, "198.51.100.10").status).toBe(201);
  });
});

/* ------------------------------------------------------------------ */

describe("event stream bounds", () => {
  it("ends a kicked player's open stream right after the kick event", async () => {
    const { sessionId, owner, joinAs } = await setup();
    const bima = joinAs("Bima");
    const { response } = openEvents(sessionId, creds(bima));
    const sse = new SseReader(await response);
    await sse.until((f) => f.length >= 1);

    hostCommand(sessionId, owner, { command: "kick", playerId: bima.playerId });
    await sse.until(() => false, 500);
    expect(sse.events().some((e) => e.type === "player.kicked" && e.playerId === bima.playerId)).toBe(true);
    expect(sse.done).toBe(true);
    expect(getGameRuntime().stats().subscribers).toBe(0);
  });

  it("keeps at most 8 host streams per session, closing the oldest", async () => {
    const { sessionId, key } = await setup();
    const cookie = { cookie: `${HOST_KEY_COOKIE}=${key}` };
    const first = new SseReader(await openEvents(sessionId, {}, cookie).response);
    await first.until((f) => f.length >= 1);
    const others = [];
    for (let i = 0; i < 8; i++) {
      const res = await openEvents(sessionId, {}, cookie).response;
      expect(res.status).toBe(200);
      others.push(new SseReader(res));
    }
    await first.until(() => false, 300);
    expect(first.done).toBe(true);
    expect(getGameRuntime().stats().subscribers).toBe(8);
    await Promise.all(others.map((r) => r.cancel()));
  });
});

/* ------------------------------------------------------------------ */

describe("sign-in throttling does not trust the client address", () => {
  it("caps failures per account across rotating (spoofed) addresses", () => {
    const throttle = new LoginThrottle();
    for (let i = 0; i < LOGIN_RULES.email.max; i++) {
      expect(throttle.isBlocked("laras@binus.edu", `203.0.113.${i}`, T0 + i)).toBe(false);
      throttle.recordFailure("laras@binus.edu", `203.0.113.${i}`, T0 + i);
    }
    expect(throttle.isBlocked("laras@binus.edu", "198.51.100.77", T0 + 60_000)).toBe(true);
    expect(throttle.isBlocked("LARAS@binus.edu", "198.51.100.78", T0 + 60_000)).toBe(true);
    // Other accounts are unaffected, and the window expires.
    expect(throttle.isBlocked("budi@binus.edu", "198.51.100.77", T0 + 60_000)).toBe(false);
    expect(throttle.isBlocked("laras@binus.edu", "198.51.100.77", T0 + LOGIN_RULES.email.windowMs + 100)).toBe(false);
  });

  it("a successful sign-in does not reset the per-account count", () => {
    const throttle = new LoginThrottle();
    for (let i = 0; i < LOGIN_RULES.email.max - 1; i++) throttle.recordFailure("a@b.id", `203.0.113.${i}`, T0);
    throttle.recordSuccess("a@b.id", "10.0.0.1");
    throttle.recordFailure("a@b.id", "203.0.113.200", T0);
    expect(throttle.isBlocked("a@b.id", "10.0.0.1", T0)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */

describe("no prototype pollution through ids", () => {
  const polluted = () => {
    const probe: Record<string, unknown> = {};
    const inherited: string[] = [];
    for (const key in probe) inherited.push(key);
    return {
      kicked: (probe as { kicked?: unknown }).kicked,
      connected: (probe as { connected?: unknown }).connected,
      inherited,
    };
  };

  it("rejects a kick of an Object.prototype name at the API boundary", () => {
    for (const playerId of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      expect(hostCommandBodySchema.safeParse({ command: "kick", playerId }).success).toBe(false);
    }
    expect(hostCommandBodySchema.safeParse({ command: "kick", playerId: "demo-p07" }).success).toBe(true);
  });

  it("the engine never kicks (or marks) the shared prototype", () => {
    const engine = GameEngine.create({
      sessionId: "s",
      roomCode: "123456",
      hostName: "h",
      quiz: quiz([question("single")]),
      now: T0,
    });
    expect(engine.kickPlayer("__proto__")).toBe(false);
    engine.setConnected("__proto__", false);
    engine.removePlayer("constructor");
    expect(engine.submitAnswer("__proto__", "q", { kind: "choice", answerIds: ["x"] }, T0)).toMatchObject({
      reason: "unknown_player",
    });
    expect(polluted()).toEqual({ kicked: undefined, connected: undefined, inherited: [] });
  });

  it("rejects quizzes whose ids are Object.prototype names (answers are keyed by question id)", async () => {
    for (const bad of ["__proto__", "constructor", "valueOf"]) {
      const crafted = quiz([question("single", { id: bad })]);
      expect(QuizSchema.safeParse(crafted).success).toBe(false);
      expect(createSessionBodySchema.safeParse({ quizId: crafted.id, quiz: crafted }).success).toBe(false);
      const badAnswer = quiz([
        question("single", {
          id: "q1",
          answers: [
            { id: bad, position: 0, text: "A", isCorrect: true },
            { id: "b", position: 1, text: "B", isCorrect: false },
          ],
        }),
      ]);
      expect(QuizSchema.safeParse(badAnswer).success).toBe(false);
    }
    expect(QuizSchema.safeParse(quiz([question("single", { id: "q1" })])).success).toBe(true);
  });
});

/* ------------------------------------------------------------------ */

describe("proxy.ts covers every lecturer page", () => {
  it("sends a signed-out visitor of /analytics to the sign-in page", () => {
    expect(isProtectedPath("/analytics")).toBe(true);
    expect(loginRedirectFor({ pathname: "/analytics", search: "", hasSessionCookie: false, databaseMode: true })).toBe(
      "/login?next=%2Fanalytics",
    );
    expect(isProtectedPath("/analyticsx")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */

describe("logs never carry a failed query's bound values", () => {
  const hash = "scrypt$16384$8$1$c2FsdHNhbHQ=$aGFzaGhhc2hoYXNo";
  const failed = new DrizzleQueryError(
    'insert into "users" ("email", "password_hash") values ($1, $2)',
    ["laras@binus.edu", hash],
    new Error("connection terminated unexpectedly"),
  );

  it("describeError keeps the SQL and the driver message only", () => {
    expect(failed.message).toContain(hash); // what used to be logged
    const line = describeError(failed);
    expect(line).toContain('insert into "users"');
    expect(line).toContain("connection terminated unexpectedly");
    expect(line).not.toContain(hash);
    expect(line).not.toContain("laras@binus.edu");
  });

  it("loggableError redacts query errors and keeps everything else intact", () => {
    expect(String(loggableError(failed))).not.toContain(hash);
    const other = new Error("boom");
    expect(loggableError(other)).toBe(other);
  });
});
