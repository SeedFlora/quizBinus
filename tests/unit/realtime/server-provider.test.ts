/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSnapshot } from "@/lib/game/types";
import type { ConnectionStatus, GameEvent, PlayerCredentials, Role } from "@/lib/realtime/types";
import { ServerRealtimeProvider } from "@/lib/realtime/server/provider";

/**
 * ServerRealtimeProvider with the network faked at its only edge, `fetch`. The
 * events route answers with a real ReadableStream that the test feeds SSE bytes
 * into, chunk by chunk, so parsing is exercised exactly as a browser would see a
 * streamed response (split frames, split UTF-8, heartbeats, aborts).
 */

const encoder = new TextEncoder();

/** One open SSE response. `push` enqueues raw bytes; abort errors it like fetch does. */
class SseStream {
  private controller!: ReadableStreamDefaultController<Uint8Array>;
  readonly body = new ReadableStream<Uint8Array>({
    start: (c) => {
      this.controller = c;
    },
  });
  closed = false;
  aborted = false;

  constructor(signal: AbortSignal | null | undefined) {
    signal?.addEventListener("abort", () => {
      this.aborted = true;
      this.fail(new DOMException("The operation was aborted.", "AbortError"));
    });
  }

  push(chunk: string | Uint8Array) {
    if (this.closed) return;
    this.controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
  }

  frame(event: GameEvent) {
    this.push(`data: ${JSON.stringify(event)}\n\n`);
  }

  /** Server closed the response (deploy, proxy timeout). */
  end() {
    if (this.closed) return;
    this.closed = true;
    this.controller.close();
  }

  fail(error: unknown) {
    if (this.closed) return;
    this.closed = true;
    this.controller.error(error);
  }
}

type EventsReply = { kind: "stream" } | { kind: "status"; status: number } | { kind: "network" } | { kind: "hang" };

interface Call {
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
  signal: AbortSignal | null;
}

let calls: Call[];
let streams: SseStream[];
/** Scripted replies for POST …/events; the last one repeats. */
let eventsReplies: EventsReply[];
/** Other routes: `METHOD url` → handler. */
let routes: Record<string, (body: unknown) => Response | Promise<Response>>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  calls = [];
  streams = [];
  eventsReplies = [{ kind: "stream" }];
  routes = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
      const headers = Object.fromEntries(new Headers(init.headers).entries());
      calls.push({ url: input, method, body, headers, signal: init.signal ?? null });

      if (input.endsWith("/events")) {
        const reply = eventsReplies.length > 1 ? eventsReplies.shift()! : eventsReplies[0]!;
        if (reply.kind === "network") throw new TypeError("Failed to fetch");
        if (reply.kind === "status") return json({ error: "nope" }, reply.status);
        if (reply.kind === "hang") {
          return new Promise<Response>((_, reject) =>
            init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
          );
        }
        const stream = new SseStream(init.signal);
        streams.push(stream);
        return new Response(stream.body, { status: 200, headers: { "content-type": "text/event-stream" } });
      }

      const handler = routes[`${method} ${input}`];
      if (!handler) return json({ error: "not_found" }, 404);
      return handler(body);
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const snap = (serverNow: number, phase: SessionSnapshot["phase"] = "lobby") =>
  ({ sessionId: "s1", serverNow, phase, players: [], leaderboard: [] }) as unknown as SessionSnapshot;
const snapshotEvent = (serverNow: number, phase?: SessionSnapshot["phase"]): GameEvent => ({
  type: "snapshot",
  snapshot: snap(serverNow, phase),
});

const PLAYER: PlayerCredentials = {
  sessionId: "s1",
  playerId: "p1",
  token: "tok_SECRET-abc123",
  roomCode: "123456",
  nickname: "Ayu",
  avatarSeed: "ayu",
};
const HOST: Role = { kind: "host" };
const AS_PLAYER: Role = { kind: "player", credentials: PLAYER };

/** Lets stream reads, TextDecoderStream and promise chains settle. */
async function flush(rounds = 8) {
  for (let i = 0; i < rounds; i++) await new Promise<void>((r) => queueMicrotask(r));
  // Real timers: also yield one macrotask so stream pumps get a turn.
  if (!vi.isFakeTimers()) await new Promise((r) => setTimeout(r, 0));
}

function watch(provider: ServerRealtimeProvider, role: Role = HOST) {
  const events: GameEvent[] = [];
  const statuses: ConnectionStatus[] = [];
  const off = provider.subscribe(
    "s1",
    role,
    (e) => events.push(e),
    (s) => statuses.push(s),
  );
  return {
    events,
    statuses,
    off,
    snapshots: () => events.flatMap((e) => (e.type === "snapshot" ? [e.snapshot.serverNow] : [])),
  };
}

const eventCalls = () => calls.filter((c) => c.url.endsWith("/events"));

describe("ServerRealtimeProvider: SSE parsing", () => {
  it("reassembles frames split across chunks, ignores heartbeats and malformed frames", async () => {
    const sub = watch(new ServerRealtimeProvider());
    await flush();
    expect(sub.statuses).toEqual(["connecting"]);
    const stream = streams[0]!;

    // A heartbeat before the first snapshot: the stream is alive but not yet "online".
    stream.push(": ping\n\n");
    await flush();
    expect(sub.events).toEqual([]);
    expect(sub.statuses).toEqual(["connecting"]);

    // First frame split mid-keyword, mid-JSON and between the two newlines.
    const first = `data: ${JSON.stringify(snapshotEvent(100))}\n\n`;
    for (const part of [first.slice(0, 2), first.slice(2, 17), first.slice(17, -1), first.slice(-1)]) {
      stream.push(part);
      await flush();
    }
    expect(sub.snapshots()).toEqual([100]);
    expect(sub.statuses).toEqual(["connecting", "online"]);

    // Two frames in one chunk, a heartbeat between them, and garbage that must not break the stream.
    const joined: GameEvent = {
      type: "player.joined",
      player: { id: "p9", nickname: "Bima", avatarSeed: "b" },
      playerCount: 1,
    };
    stream.push(`data: ${JSON.stringify(joined)}\n\n: ping\n\ndata: {not json\n\n`);
    stream.frame({ type: "progress", questionId: "q1", answered: 3, total: 4 });
    await flush();
    expect(sub.events.map((e) => e.type)).toEqual(["snapshot", "player.joined", "progress"]);
    expect(sub.statuses).toEqual(["connecting", "online"]);
    sub.off();
  });

  it("decodes a multi-byte UTF-8 nickname split between two chunks", async () => {
    const sub = watch(new ServerRealtimeProvider());
    await flush();
    const event: GameEvent = {
      type: "player.joined",
      player: { id: "p2", nickname: "Nadia ✨ Rê", avatarSeed: "n" },
      playerCount: 2,
    };
    const bytes = encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
    const cut = bytes.indexOf(0xe2) + 1; // inside the 3-byte "✨"
    streams[0]!.push(bytes.slice(0, cut));
    await flush();
    streams[0]!.push(bytes.slice(cut));
    await flush();
    expect(sub.events).toEqual([event]);
    sub.off();
  });

  it("accepts `data:` without a space and multi-line data fields", async () => {
    const sub = watch(new ServerRealtimeProvider());
    await flush();
    streams[0]!.push(`data:{"type":"player.left",\ndata: "playerId":"p3","playerCount":0}\n\n`);
    await flush();
    expect(sub.events).toEqual([{ type: "player.left", playerId: "p3", playerCount: 0 }]);
    sub.off();
  });
});

describe("ServerRealtimeProvider: connection lifecycle", () => {
  it("connecting → online → reconnecting → online, resyncing from the first snapshot of the new stream", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const sub = watch(new ServerRealtimeProvider());
    await flush();
    streams[0]!.frame(snapshotEvent(100, "lobby"));
    await flush();
    expect(sub.statuses).toEqual(["connecting", "online"]);

    // The server (or a proxy) drops the response.
    streams[0]!.end();
    await flush();
    expect(sub.statuses).toEqual(["connecting", "online", "reconnecting"]);
    expect(eventCalls()).toHaveLength(1);

    // First retry after 500 ms.
    await vi.advanceTimersByTimeAsync(499);
    expect(eventCalls()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(eventCalls()).toHaveLength(2);
    expect(sub.statuses.at(-1)).toBe("reconnecting"); // headers alone are not "back"

    // The new stream opens with the full current state: that is the resync.
    streams[1]!.frame(snapshotEvent(900, "question"));
    await flush();
    expect(sub.statuses).toEqual(["connecting", "online", "reconnecting", "online"]);
    expect(sub.snapshots()).toEqual([100, 900]);
    sub.off();
  });

  it("backs off 0.5 → 1 → 2 → 4 → 5 s, reports offline after repeated failures, and resets once back", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    eventsReplies = [
      { kind: "network" },
      { kind: "network" },
      { kind: "network" },
      { kind: "network" },
      { kind: "network" },
      { kind: "stream" },
    ];
    const sub = watch(new ServerRealtimeProvider());
    await flush();
    expect(eventCalls()).toHaveLength(1);
    expect(sub.statuses).toEqual(["connecting", "reconnecting"]);

    const gaps = [500, 1000, 2000, 4000, 5000];
    for (const [i, gap] of gaps.entries()) {
      await vi.advanceTimersByTimeAsync(gap - 1);
      expect(eventCalls(), `retry ${i + 1} must wait ${gap} ms`).toHaveLength(i + 1);
      await vi.advanceTimersByTimeAsync(1);
      await flush();
      expect(eventCalls()).toHaveLength(i + 2);
    }
    // Four straight failures: the UI says so instead of spinning forever.
    expect(sub.statuses).toEqual(["connecting", "reconnecting", "offline"]);

    // The sixth attempt got a stream; its first snapshot brings us back.
    streams[0]!.frame(snapshotEvent(500));
    await flush();
    expect(sub.statuses.at(-1)).toBe("online");

    // A later drop starts over at the shortest delay.
    streams[0]!.end();
    await flush();
    expect(sub.statuses.at(-1)).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(500);
    await flush();
    expect(eventCalls()).toHaveLength(7);
    sub.off();
  });

  it("retries a 5xx like a network error", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    eventsReplies = [{ kind: "status", status: 503 }, { kind: "stream" }];
    const sub = watch(new ServerRealtimeProvider());
    await flush();
    expect(sub.statuses).toEqual(["connecting", "reconnecting"]);
    await vi.advanceTimersByTimeAsync(500);
    await flush();
    streams[0]!.frame(snapshotEvent(1));
    await flush();
    expect(sub.statuses).toEqual(["connecting", "reconnecting", "online"]);
    expect(sub.events.some((e) => e.type === "session.ended")).toBe(false);
    sub.off();
  });

  it("aborts a silent stream after 35 s; heartbeats keep it alive", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const sub = watch(new ServerRealtimeProvider());
    await flush();
    streams[0]!.frame(snapshotEvent(1));
    await flush();

    // Heartbeats every 15 s: never stale.
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(15_000);
      streams[0]!.push(": ping\n\n");
      await flush();
    }
    expect(streams[0]!.aborted).toBe(false);
    expect(sub.statuses).toEqual(["connecting", "online"]);

    // Then silence (half-open TCP on a phone that slept).
    await vi.advanceTimersByTimeAsync(35_000);
    await flush();
    expect(streams[0]!.aborted).toBe(true);
    expect(sub.statuses.at(-1)).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(500);
    await flush();
    expect(eventCalls()).toHaveLength(2);
    sub.off();
  });

  it.each([401, 403])("treats %i as terminal: offline, no retry, no invented end event", async (status) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    eventsReplies = [{ kind: "status", status }];
    const sub = watch(new ServerRealtimeProvider(), AS_PLAYER);
    await flush();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(eventCalls()).toHaveLength(1);
    expect(sub.statuses).toEqual(["connecting", "offline"]);
    expect(sub.events).toEqual([]);
    sub.off();
  });

  it.each([404, 410])(
    "treats %i as a session that is gone: session.ended(expired), offline, no retry",
    async (status) => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
      eventsReplies = [{ kind: "status", status }];
      const sub = watch(new ServerRealtimeProvider(), AS_PLAYER);
      await flush();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(eventCalls()).toHaveLength(1);
      expect(sub.events).toEqual([{ type: "session.ended", reason: "expired" }]);
      expect(sub.statuses).toEqual(["connecting", "offline"]);
      sub.off();
    },
  );

  it("unsubscribe aborts the stream and cancels a pending retry", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const sub = watch(new ServerRealtimeProvider());
    await flush();
    streams[0]!.frame(snapshotEvent(1));
    await flush();
    sub.off();
    await flush();
    expect(streams[0]!.aborted).toBe(true);
    expect(calls[0]!.signal?.aborted).toBe(true);

    // Unsubscribing during a backoff wait: the retry never fires.
    eventsReplies = [{ kind: "network" }];
    const again = watch(new ServerRealtimeProvider());
    await flush();
    expect(again.statuses).toEqual(["connecting", "reconnecting"]);
    again.off();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(eventCalls()).toHaveLength(2);
    expect(again.statuses).toEqual(["connecting", "reconnecting"]);
  });

  it("reconnects at once when the device comes back online, without waiting out the backoff", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    eventsReplies = [{ kind: "network" }, { kind: "network" }, { kind: "network" }, { kind: "stream" }];
    const sub = watch(new ServerRealtimeProvider());
    await flush();
    await vi.advanceTimersByTimeAsync(500);
    await flush();
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(eventCalls()).toHaveLength(3); // now waiting 2 s

    window.dispatchEvent(new Event("online"));
    await flush();
    expect(eventCalls()).toHaveLength(4);
    streams[0]!.frame(snapshotEvent(7));
    await flush();
    expect(sub.statuses.at(-1)).toBe("online");

    // The cancelled backoff timer does not open a second stream later.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(eventCalls()).toHaveLength(4);
    sub.off();
  });

  // Regression: onOnline() used to leave the aborted attempt scheduling a retry of its
  // own, i.e. two concurrent streams and one that unsubscribe could never close.
  it("an `online` event during a live stream replaces it with exactly one new stream", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const sub = watch(new ServerRealtimeProvider());
    await flush();
    streams[0]!.frame(snapshotEvent(1));
    await flush();

    window.dispatchEvent(new Event("online"));
    await flush();
    await vi.advanceTimersByTimeAsync(10_000);
    await flush();

    const open = streams.filter((s) => !s.closed);
    expect(streams[0]!.aborted).toBe(true);
    expect(open, "exactly one live SSE stream after the online event").toHaveLength(1);
    expect(eventCalls()).toHaveLength(2);

    sub.off();
    await flush();
    expect(
      streams.every((s) => s.closed),
      "unsubscribe closes every stream",
    ).toBe(true);
  });
});

describe("ServerRealtimeProvider: credentials on the wire", () => {
  it("never puts the player token in a URL; it travels in POST bodies only", async () => {
    routes["POST /api/sessions/s1/player"] = () => json({ ok: true, snapshot: snap(1) });
    routes["POST /api/sessions/s1/answer"] = () => json({ status: "accepted", receivedAt: 1 });
    const provider = new ServerRealtimeProvider();

    const sub = watch(provider, AS_PLAYER);
    await flush();
    await provider.resumePlayer(PLAYER);
    await provider.getSnapshot("s1", AS_PLAYER);
    await provider.submitAnswer(PLAYER, "q1", { kind: "single", answerId: "a" } as never);
    await provider.getSummary(PLAYER);
    await provider.leaveSession(PLAYER);
    sub.off();

    expect(calls.length).toBeGreaterThanOrEqual(6);
    for (const call of calls) {
      expect(call.url, `${call.method} ${call.url}`).not.toContain(PLAYER.token);
      expect(call.url).not.toMatch(/[?&]token=/);
      expect(call.method).toBe("POST");
      expect(call.body).toMatchObject({ playerId: "p1", token: PLAYER.token });
    }

    const events = eventCalls()[0]!;
    expect(events.url).toBe("/api/sessions/s1/events");
    expect(events.headers.accept).toBe("text/event-stream");
    expect(events.body).toEqual({ playerId: "p1", token: PLAYER.token }); // nothing else from localStorage
  });

  it("host streams carry no player credentials (the cookie identifies the lecturer)", async () => {
    const sub = watch(new ServerRealtimeProvider(), HOST);
    await flush();
    expect(eventCalls()[0]!.body).toEqual({});
    expect(eventCalls()[0]!.method).toBe("POST");
    sub.off();
  });

  it("encodes path segments", async () => {
    const provider = new ServerRealtimeProvider();
    await provider.resolveRoom("12/34?x");
    expect(calls[0]!.url).toBe("/api/rooms/12%2F34%3Fx");
  });
});

describe("ServerRealtimeProvider: commands", () => {
  it("maps host commands onto POST /host", async () => {
    const seen: unknown[] = [];
    routes["POST /api/sessions/s1/host"] = (body) => {
      seen.push(body);
      return json({ ok: true });
    };
    const p = new ServerRealtimeProvider();
    await p.startGame("s1");
    await p.publishQuestion("s1");
    await p.closeQuestion("s1");
    await p.publishResults("s1");
    await p.publishLeaderboard("s1");
    await p.nextQuestion("s1");
    await p.finishGame("s1");
    await p.pauseGame("s1");
    await p.resumeGame("s1");
    await p.skipQuestion("s1");
    await p.endSession("s1");
    await p.setJoinsLocked("s1", true);
    await p.setJoinsLocked("s1", false);
    await p.setLeaderboardVisible("s1", true);
    await p.setLeaderboardVisible("s1", false);
    await p.kickPlayer("s1", "p7");
    expect(seen.map((b) => (b as { command: string }).command)).toEqual([
      "start",
      "publishQuestion",
      "closeQuestion",
      "publishResults",
      "publishLeaderboard",
      "next",
      "finish",
      "pause",
      "resume",
      "skip",
      "end",
      "lock",
      "unlock",
      "showLeaderboard",
      "hideLeaderboard",
      "kick",
    ]);
    expect(seen.at(-1)).toEqual({ command: "kick", playerId: "p7" });
  });

  it("returns typed fallbacks when the network fails, and the server's error body when it answers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const p = new ServerRealtimeProvider();
    expect(await p.startGame("s1")).toEqual({ ok: false, error: "network" });
    expect(await p.resolveRoom("123456")).toEqual({ status: "not_found" });
    expect(await p.joinSession({ roomCode: "123456", nickname: "Ayu", avatarSeed: "a" })).toEqual({
      ok: false,
      error: "network",
    });
    expect(await p.resumePlayer(PLAYER)).toEqual({ ok: false, error: "network" });
    expect(await p.submitAnswer(PLAYER, "q1", { kind: "single", answerId: "a" } as never)).toEqual({
      status: "invalid",
      reason: "network",
    });
    expect(await p.getSummary(PLAYER)).toBeNull();
    expect(await p.getSnapshot("s1", HOST)).toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.startsWith("/api/rooms/") && url.endsWith("/join")
          ? json({ ok: false, error: "nickname_taken" }, 409)
          : url.startsWith("/api/rooms/")
            ? json({ status: "rate_limited" }, 429)
            : json({ error: "quiz_not_found" }, 404),
      ),
    );
    expect(await p.resolveRoom("123456")).toEqual({ status: "rate_limited" });
    expect(await p.joinSession({ roomCode: "123456", nickname: "Ayu", avatarSeed: "a" })).toEqual({
      ok: false,
      error: "nickname_taken",
    });
    await expect(p.createSession({ quizId: "os-battle" })).rejects.toThrow("quiz_not_found");
  });

  it("createSession posts the quiz id (and an inline quiz when given) and returns the new room", async () => {
    let body: unknown;
    routes["POST /api/sessions"] = (b) => {
      body = b;
      return json({ sessionId: "s9", roomCode: "654321" });
    };
    const p = new ServerRealtimeProvider();
    expect(await p.createSession({ quizId: "os-battle" })).toEqual({ sessionId: "s9", roomCode: "654321" });
    expect(body).toEqual({ quizId: "os-battle" });
  });
});
