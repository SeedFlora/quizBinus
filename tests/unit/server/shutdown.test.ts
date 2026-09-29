import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/bootstrap", () => ({ ensureServerReady: async () => undefined }));
vi.mock("@/lib/auth/lecturer", () => ({ getLecturerOrNull: async () => null }));

import {
  ServerGameRuntime,
  getGameRuntime,
  type SessionPersistence,
  type StoredSessionRecord,
} from "@/lib/server/game-runtime";
import { openSessionEvents } from "@/lib/server/sse";
import { jsonRequest, resetServer, testQuiz } from "./helpers";

/** Persistence that records saves and resolves flush() only after every save "landed". */
function spyPersistence() {
  const saved: StoredSessionRecord[] = [];
  const order: string[] = [];
  const persistence: SessionPersistence = {
    save: async (record) => {
      saved.push(record);
      order.push("save");
    },
    loadActive: async () => [],
    isRoomCodeTaken: async () => false,
    flush: async () => {
      order.push("flush");
    },
  };
  return { persistence, saved, order };
}

const host = { id: "11111111-1111-4111-8111-111111111111", displayName: "Pak Budi" };

describe("ServerGameRuntime.shutdown (SIGTERM)", () => {
  it("writes pending saves, flushes, then closes every open stream", async () => {
    const runtime = new ServerGameRuntime();
    const { persistence, saved, order } = spyPersistence();
    runtime.usePersistence(persistence);
    const { sessionId } = await runtime.createSession(testQuiz(), host);
    const close = vi.fn(() => order.push("close"));
    runtime.subscribe(sessionId, { role: "host", send: () => undefined, close });

    // A change right before the signal sits in the 400 ms save debounce.
    expect(runtime.get(sessionId)!.authority.setJoinsLocked(true).ok).toBe(true);
    const before = saved.length;

    await runtime.shutdown();

    expect(saved.length).toBeGreaterThan(before);
    expect(close).toHaveBeenCalledTimes(1);
    expect(order.slice(-2)).toEqual(["flush", "close"]);
    expect(runtime.stats().subscribers).toBe(0);
    runtime.drop(sessionId);
  });

  it("ends streams opened while shutting down right after their first frame", async () => {
    const runtime = new ServerGameRuntime();
    runtime.usePersistence(spyPersistence().persistence);
    const { sessionId } = await runtime.createSession(testQuiz(), host);
    await runtime.shutdown();

    const close = vi.fn();
    runtime.subscribe(sessionId, { role: "player", playerId: "p1", send: () => undefined, close });
    expect(close).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(close).toHaveBeenCalledTimes(1);
    expect(runtime.stats().subscribers).toBe(0);
    runtime.drop(sessionId);
  });

  it("refuses new event streams with 503 once the process is stopping", async () => {
    resetServer();
    const runtime = getGameRuntime();
    const { sessionId, roomCode } = await runtime.createSession(testQuiz(), host);
    const joined = runtime.findByRoom(roomCode)!.authority.join({ nickname: "Rara", avatarSeed: "rara" });
    if (!joined.ok) throw new Error(joined.error);
    const body = { role: "player" as const, playerId: joined.credentials.playerId, token: joined.credentials.token };
    const request = () => jsonRequest(`/api/sessions/${sessionId}/events`, body);

    const open = await openSessionEvents(sessionId, body, request(), "10.0.0.9");
    expect(open).toBeInstanceOf(Response);
    await (open as Response).body?.cancel();

    await runtime.shutdown();
    expect(runtime.isShuttingDown).toBe(true);
    const refused = await openSessionEvents(sessionId, body, request(), "10.0.0.9");
    expect(refused).not.toBeInstanceOf(Response);
    expect(refused).toMatchObject({
      status: 503,
      body: { error: "server_restarting" },
      headers: { "Retry-After": "2" },
    });
    resetServer();
    // The singleton lives on globalThis: never hand a stopped runtime to another test file.
    delete (globalThis as { __nqRuntime?: unknown }).__nqRuntime;
  });
});
