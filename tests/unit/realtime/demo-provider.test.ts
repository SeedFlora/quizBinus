/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSnapshot } from "@/lib/game/types";
import { HybridDemoProvider } from "@/lib/realtime/demo-provider";
import type { LocalRealtimeProvider } from "@/lib/realtime/local/provider";
import type {
  GameEvent,
  JoinResult,
  PlayerCredentials,
  RealtimeGameProvider,
  ResumeResult,
  RoomLookup,
} from "@/lib/realtime/types";

/**
 * HybridDemoProvider decides, per call, whether the demo PIN / "demo" session lives on
 * the game server or in this tab (offline solo demo). Both transports are fakes that
 * record what reached them, so each test states which side a call must land on.
 */

const DEMO_PIN = "482913";

type Fake = RealtimeGameProvider & { calls: string[] };

function fakeProvider(name: string, overrides: Partial<RealtimeGameProvider> = {}): Fake {
  const calls: string[] = [];
  const record =
    <T>(method: string, value: T) =>
    async () => {
      calls.push(method);
      return value;
    };
  const base = {
    kind: name === "server" ? "server" : "local",
    calls,
    resolveRoom: record<RoomLookup>("resolveRoom", { status: "not_found" }),
    createSession: record("createSession", { sessionId: `${name}-s`, roomCode: "123456" }),
    startGame: record("startGame", { ok: true }),
    publishQuestion: record("publishQuestion", { ok: true }),
    closeQuestion: record("closeQuestion", { ok: true }),
    publishResults: record("publishResults", { ok: true }),
    publishLeaderboard: record("publishLeaderboard", { ok: true }),
    nextQuestion: record("nextQuestion", { ok: true }),
    finishGame: record("finishGame", { ok: true }),
    pauseGame: record("pauseGame", { ok: true }),
    resumeGame: record("resumeGame", { ok: true }),
    skipQuestion: record("skipQuestion", { ok: true }),
    setJoinsLocked: record("setJoinsLocked", { ok: true }),
    setLeaderboardVisible: record("setLeaderboardVisible", { ok: true }),
    kickPlayer: record("kickPlayer", { ok: true }),
    endSession: record("endSession", { ok: true }),
    joinSession: record<JoinResult>("joinSession", { ok: false, error: "not_found" }),
    resumePlayer: record<ResumeResult>("resumePlayer", { ok: false, error: "not_found" }),
    leaveSession: record("leaveSession", undefined),
    submitAnswer: record("submitAnswer", { status: "accepted", responseTimeMs: 1 }),
    getSummary: record("getSummary", null),
    getSnapshot: record<SessionSnapshot | null>("getSnapshot", null),
    subscribe: vi.fn(() => {
      calls.push("subscribe");
      return () => calls.push("unsubscribe");
    }),
    ensureHostDemo: record("ensureHostDemo", { sessionId: "demo", roomCode: DEMO_PIN }),
    ...overrides,
  };
  return base as unknown as Fake;
}

const creds = (playerId: string): PlayerCredentials => ({
  sessionId: "demo",
  playerId,
  token: `tok-${playerId}`,
  roomCode: DEMO_PIN,
  nickname: "Rara",
  avatarSeed: "r",
});

const joined = (playerId: string): JoinResult => ({
  ok: true,
  credentials: creds(playerId),
  snapshot: { sessionId: "demo" } as unknown as SessionSnapshot,
});

const OK_LOOKUP: RoomLookup = {
  status: "ok",
  sessionId: "demo",
  roomCode: DEMO_PIN,
  quizTitle: "OS Battle",
  courseCode: "COMP6716",
  courseName: "Operating Systems",
  hostName: "Bu Laras",
  playerCount: 12,
};

let server: Fake;
let local: Fake;
const hybrid = () => new HybridDemoProvider(server, () => local as unknown as LocalRealtimeProvider);
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  window.localStorage.clear();
  server = fakeProvider("server");
  local = fakeProvider("local");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HybridDemoProvider: the demo PIN", () => {
  it("joins the SERVER demo when one is running, and remembers that across a refresh", async () => {
    server = fakeProvider("server", {
      resolveRoom: async () => OK_LOOKUP,
      joinSession: async () => joined("p-server"),
      submitAnswer: async () => {
        server.calls.push("submitAnswer");
        return { status: "accepted", responseTimeMs: 5 };
      },
    });
    const p = hybrid();
    expect(await p.resolveRoom(DEMO_PIN)).toEqual(OK_LOOKUP);
    const res = await p.joinSession({ roomCode: DEMO_PIN, nickname: "Rara", avatarSeed: "r" });
    expect(res.ok).toBe(true);
    expect(local.calls).toEqual([]);

    // A refreshed tab (new provider instance) routes this player straight to the server.
    const afterRefresh = hybrid();
    await afterRefresh.submitAnswer(creds("p-server"), "q1", { kind: "choice", answerIds: ["a"] });
    expect(server.calls).toContain("submitAnswer");
    expect(server.calls).not.toContain("resumePlayer"); // no probe needed: it was remembered
    expect(local.calls).toEqual([]);
  });

  it.each<RoomLookup["status"]>(["not_found", "ended"])(
    "falls back to the offline solo demo when the server lookup says %s",
    async (status) => {
      server = fakeProvider("server", { resolveRoom: async () => ({ status }) as RoomLookup });
      local = fakeProvider("local", {
        resolveRoom: async () => OK_LOOKUP,
        joinSession: async () => {
          local.calls.push("joinSession");
          return joined("p-local");
        },
      });
      const p = hybrid();
      expect((await p.resolveRoom(DEMO_PIN)).status).toBe("ok");
      const res = await p.joinSession({ roomCode: DEMO_PIN, nickname: "Rara", avatarSeed: "r" });
      expect(res.ok && res.credentials.playerId).toBe("p-local");
      expect(server.calls).not.toContain("joinSession");

      // …and the player's later calls stay local, even after a refresh.
      await hybrid().submitAnswer(creds("p-local"), "q1", { kind: "choice", answerIds: ["a"] });
      expect(local.calls).toContain("submitAnswer");
      expect(server.calls).not.toContain("submitAnswer");
    },
  );

  it("passes other server lookups through without touching the offline demo", async () => {
    server = fakeProvider("server", { resolveRoom: async () => ({ status: "rate_limited" }) });
    expect(await hybrid().resolveRoom(DEMO_PIN)).toEqual({ status: "rate_limited" });
    expect(await hybrid().resolveRoom("654321")).toEqual({ status: "rate_limited" });
    expect(local.calls).toEqual([]);
  });

  it("falls back to local when the server demo ends between lookup and join", async () => {
    server = fakeProvider("server", {
      resolveRoom: async () => OK_LOOKUP,
      joinSession: async () => ({ ok: false, error: "ended" }),
    });
    local = fakeProvider("local", { resolveRoom: async () => OK_LOOKUP, joinSession: async () => joined("p-late") });
    const p = hybrid();
    await p.resolveRoom(DEMO_PIN);
    const res = await p.joinSession({ roomCode: DEMO_PIN, nickname: "Rara", avatarSeed: "r" });
    expect(res.ok && res.credentials.playerId).toBe("p-late");
  });

  it("does NOT fall back for a real join refusal (nickname taken stays on the server demo)", async () => {
    server = fakeProvider("server", {
      resolveRoom: async () => OK_LOOKUP,
      joinSession: async () => ({ ok: false, error: "nickname_taken" }),
    });
    const p = hybrid();
    await p.resolveRoom(DEMO_PIN);
    expect(await p.joinSession({ roomCode: DEMO_PIN, nickname: "Rara", avatarSeed: "r" })).toEqual({
      ok: false,
      error: "nickname_taken",
    });
    expect(local.calls).not.toContain("joinSession");
  });
});

describe("HybridDemoProvider: players with no remembered transport", () => {
  it("asks the server first (resume), then uses the local demo when the server does not know them", async () => {
    const p = hybrid();
    await p.getSummary(creds("p-unknown"));
    expect(server.calls).toEqual(["resumePlayer"]);
    expect(local.calls).toEqual(["getSummary"]);
    // The probe is not repeated.
    await p.getSummary(creds("p-unknown"));
    expect(server.calls).toEqual(["resumePlayer"]);
  });

  it("subscribes on the resolved transport; unsubscribing early never opens a stream", async () => {
    server = fakeProvider("server", {
      resumePlayer: async () => ({ ok: true, snapshot: {} as SessionSnapshot }),
    });
    const p = hybrid();
    const events: GameEvent[] = [];
    const off = p.subscribe("demo", { kind: "player", credentials: creds("p-s") }, (e) => events.push(e));
    await tick();
    expect(server.calls).toContain("subscribe");
    off();
    expect(server.calls).toContain("unsubscribe");

    const early = hybrid().subscribe("demo", { kind: "player", credentials: creds("p-t") }, () => undefined);
    early();
    await tick();
    expect(local.calls).not.toContain("subscribe");
    expect(server.calls.filter((c) => c === "subscribe")).toHaveLength(1);
  });
});

describe("HybridDemoProvider: /host/session/demo", () => {
  it("hosts the server demo when POST /api/demo/host and the host state both succeed", async () => {
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify({ url }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const p = hybrid();
    expect(await p.ensureHostDemo()).toBe("server");
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual(["/api/demo/host", "/api/sessions/demo/state"]);
    await p.startGame("demo");
    expect(server.calls).toContain("startGame");
    expect(local.calls).toEqual([]);
  });

  it("runs the demo offline in this tab when the server may not be driven (signed out in database mode)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => new Response("{}", { status: url.endsWith("/state") ? 401 : 200 })),
    );
    const p = hybrid();
    expect(await p.ensureHostDemo()).toBe("local");
    await p.startGame("demo");
    expect(local.calls).toEqual(["ensureHostDemo", "startGame"]);
    expect(server.calls).toEqual([]);
  });

  it("runs the demo offline when the server is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const p = hybrid();
    expect(await p.ensureHostDemo()).toBe("local");
    await p.closeQuestion("demo");
    expect(local.calls).toEqual(["ensureHostDemo", "closeQuestion"]);
  });

  it("new sessions are always created on the server", async () => {
    await hybrid().createSession({ quizId: "os-battle" });
    expect(server.calls).toEqual(["createSession"]);
  });
});
