import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSnapshot } from "@/lib/game/types";
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
import { createSession, hostCommand, joinRoom, submitAnswer } from "@/lib/server/game-api";
import { getGameRuntime } from "@/lib/server/game-runtime";
import { HOST_KEY_COOKIE } from "@/lib/server/host-auth";
import { hashToken } from "@/lib/security/token";
import { deepKeys } from "../../fixtures/quiz";
import { SseReader, ctx, jsonRequest, memoryHost, resetServer, testQuiz } from "./helpers";

const IP = "10.0.0.8";

async function setup() {
  const quiz = testQuiz();
  const created = await createSession(memoryHost(), { quizId: quiz.id, quiz }, jsonRequest("/api/sessions", {}), IP);
  const { sessionId, roomCode } = created.body as { sessionId: string; roomCode: string };
  const key = created.headers!["Set-Cookie"]!.match(new RegExp(`^${HOST_KEY_COOKIE}=([^;]+)`))![1]!;
  const owner = memoryHost(hashToken(key));
  const joinAs = (nickname: string) => {
    const res = joinRoom(roomCode, { nickname, avatarSeed: nickname }, IP).body as JoinResult;
    if (!res.ok) throw new Error(res.error);
    return res.credentials;
  };
  return { sessionId, roomCode, key, owner, quiz, joinAs };
}

function open(sessionId: string, body: unknown, init: { headers?: Record<string, string> } = {}) {
  const abort = new AbortController();
  const request = jsonRequest(`/api/sessions/${sessionId}/events`, body, {
    signal: abort.signal,
    headers: init.headers,
  });
  return { abort, response: eventsRoute(request, ctx({ id: sessionId })) };
}

const creds = (c: PlayerCredentials) => ({ playerId: c.playerId, token: c.token });
const snapshotOf = (event: Record<string, unknown>) => event.snapshot as SessionSnapshot;
const subscribers = () => getGameRuntime().stats().subscribers;

beforeEach(() => resetServer());
afterEach(() => {
  resetServer();
  vi.useRealTimers();
});

describe("POST /api/sessions/[id]/events (player)", () => {
  it("opens with a personal snapshot that carries no correctness, heartbeats, and unsubscribes on abort", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { sessionId, owner, joinAs } = await setup();
    const rara = joinAs("Rara");
    hostCommand(sessionId, owner, { command: "start" });
    hostCommand(sessionId, owner, { command: "publishQuestion" });

    const { abort, response } = open(sessionId, creds(rara));
    const res = await response;
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/event-stream/);
    expect(res.headers.get("cache-control")).toContain("no-transform");
    expect(res.headers.get("x-accel-buffering")).toBe("no");

    const sse = new SseReader(res);
    await sse.until((f) => f.length >= 1);
    expect(sse.frames[0]).toMatch(/^data: \{"type":"snapshot"/);
    const first = snapshotOf(sse.events()[0]!);
    expect(first.phase).toBe("question");
    expect(first.question?.id).toBe("q1");
    expect(first.self).toMatchObject({ playerId: rara.playerId, currentAnswer: null });
    const keys = deepKeys(first);
    for (const secret of ["isCorrect", "correctAnswerIds", "acceptedAnswers", "explanation"])
      expect(keys.has(secret)).toBe(false);
    expect(subscribers()).toBe(1);
    expect(getGameRuntime().get(sessionId)!.authority.engine.state.players[rara.playerId]!.connected).toBe(true);

    // 15 s of silence: a heartbeat comment keeps proxies and the client's stale timer happy.
    vi.advanceTimersByTime(15_000);
    await sse.until((f) => f.includes(": ping"));
    expect(sse.frames).toContain(": ping");

    // Client goes away: the subscriber is removed and the player counts as disconnected.
    abort.abort();
    await sse.until(() => false, 300);
    expect(sse.done).toBe(true);
    expect(subscribers()).toBe(0);
    expect(getGameRuntime().get(sessionId)!.authority.engine.state.players[rara.playerId]!.connected).toBe(false);
  });

  it("personalises every later snapshot: the locked-in answer, then the reveal", async () => {
    const { sessionId, owner, quiz, joinAs } = await setup();
    const rara = joinAs("Rara");
    joinAs("Bima");
    hostCommand(sessionId, owner, { command: "start" });
    hostCommand(sessionId, owner, { command: "publishQuestion" });
    const { abort, response } = open(sessionId, creds(rara));
    const sse = new SseReader(await response);
    await sse.until((f) => f.length >= 1);

    const right = quiz.questions[0]!.answers.find((a) => a.isCorrect)!.id;
    const payload = { kind: "choice" as const, answerIds: [right] };
    expect(submitAnswer(sessionId, { ...creds(rara), questionId: "q1", payload }).body).toMatchObject({
      status: "accepted",
    });
    hostCommand(sessionId, owner, { command: "pause" }); // broadcasts a snapshot mid-question
    await sse.until(() => sse.events().some((e) => e.type === "snapshot" && snapshotOf(e).paused));
    const paused = sse.events().find((e) => e.type === "snapshot" && snapshotOf(e).paused)!;
    expect(snapshotOf(paused).self?.currentAnswer).toEqual(payload);
    // Still nothing that gives the answer away while the question is open.
    expect(deepKeys(snapshotOf(paused)).has("isCorrect")).toBe(false);
    // The progress event went out on the same stream.
    expect(sse.events().some((e) => e.type === "progress")).toBe(true);

    hostCommand(sessionId, owner, { command: "resume" });
    hostCommand(sessionId, owner, { command: "closeQuestion" });
    await sse.until(() => sse.events().some((e) => e.type === "snapshot" && snapshotOf(e).phase === "reveal"));
    const reveal = snapshotOf(sse.events().find((e) => e.type === "snapshot" && snapshotOf(e).phase === "reveal")!);
    expect(reveal.reveal?.correctAnswerIds).toEqual([right]);
    expect(reveal.self).toMatchObject({ playerId: rara.playerId, rank: 1 });
    abort.abort();
  });

  it("answers 401 for bad credentials, 404 for an unknown session, 403 for a kicked player, 400 for a bad body", async () => {
    const { sessionId, owner, joinAs } = await setup();
    const rara = joinAs("Rara");
    const bima = joinAs("Bima");

    const forged = await open(sessionId, { playerId: rara.playerId, token: "A".repeat(43) }).response;
    expect(forged.status).toBe(401);
    expect(await forged.json()).toEqual({ ok: false, error: "unauthorized" });

    const unknown = await open("7d3b1c1e-9d7a-4f7e-8a57-2d7b4c1f0a11", creds(rara)).response;
    expect(unknown.status).toBe(404);

    hostCommand(sessionId, owner, { command: "kick", playerId: bima.playerId });
    expect((await open(sessionId, creds(bima)).response).status).toBe(403);

    expect((await open(sessionId, { playerId: rara.playerId }).response).status).toBe(400);
    expect((await open("not-a-session", creds(rara)).response).status).toBe(404);
    expect(subscribers()).toBe(0);
  });

  it("keeps at most three streams per player (the oldest is closed) and closes streams when the session is dropped", async () => {
    const { sessionId, joinAs } = await setup();
    const rara = joinAs("Rara");
    const streams = [];
    for (let i = 0; i < 4; i++) {
      const sse = new SseReader(await open(sessionId, creds(rara)).response);
      await sse.until((f) => f.length >= 1);
      streams.push(sse);
    }
    await streams[0]!.until(() => false, 300);
    expect(streams[0]!.done).toBe(true);
    expect(subscribers()).toBe(3);
    // Replacing a stale stream must not mark the player as gone.
    expect(getGameRuntime().get(sessionId)!.authority.engine.state.players[rara.playerId]!.connected).toBe(true);

    getGameRuntime().drop(sessionId);
    for (const sse of streams.slice(1)) {
      await sse.until(() => false, 300);
      expect(sse.done).toBe(true);
    }
  });
});

describe("POST /api/sessions/[id]/events (host)", () => {
  it("needs the host key cookie in memory mode and a same-origin request", async () => {
    const { sessionId, key } = await setup();

    const withKey = open(sessionId, {}, { headers: { cookie: `other=1; ${HOST_KEY_COOKIE}=${key}` } });
    const res = await withKey.response;
    expect(res.status).toBe(200);
    const sse = new SseReader(res);
    await sse.until((f) => f.length >= 1);
    const first = snapshotOf(sse.events()[0]!);
    expect(first.phase).toBe("lobby");
    expect(first.self).toBeUndefined();
    withKey.abort.abort();

    expect((await open(sessionId, {}).response).status).toBe(403);
    const crossSite = await open(
      sessionId,
      {},
      {
        headers: {
          cookie: `${HOST_KEY_COOKIE}=${key}`,
          origin: "https://evil.example",
          "sec-fetch-site": "cross-site",
        },
      },
    ).response;
    expect(crossSite.status).toBe(403);
    expect(await crossSite.json()).toEqual({ error: "cross_origin" });
  });
});
