import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchServerSessions, fetchSessionEngineState, ServerSourceError } from "@/lib/analytics/server-source";
import { simulateGame } from "@/lib/demo/simulate";

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchServerSessions", () => {
  it("normalizes database rows and live runtime rows into one shape, newest first", async () => {
    stubFetch(200, {
      sessions: [
        // A row as lib/db/reports.ts lists it: ISO timestamps, database status.
        {
          id: "0f5c2b1e-1111-4a2b-8c3d-000000000001",
          quizId: null,
          quizTitle: "Kuis lama",
          courseCode: "COMP6153",
          roomCode: "731604",
          status: "finished",
          players: 38,
          accuracy: 0.62,
          startedAt: "2026-09-21T06:26:00.000Z",
          endedAt: "2026-09-21T06:41:00.000Z",
          createdAt: "2026-09-21T06:20:00.000Z",
        },
        // A live session as the runtime may report it: epoch ms and an engine phase.
        {
          id: "0f5c2b1e-1111-4a2b-8c3d-000000000002",
          quizId: "os-battle",
          quizTitle: "OS Battle",
          courseCode: "COMP6153",
          roomCode: "482913",
          status: "question",
          players: 12,
          accuracy: null,
          startedAt: Date.parse("2026-09-28T06:26:00.000Z"),
          endedAt: null,
          createdAt: Date.parse("2026-09-28T06:20:00.000Z"),
        },
        { id: 42, status: "broken" },
      ],
    });
    const sessions = await fetchServerSessions();
    expect(sessions.map((s) => [s.id.slice(-1), s.status, s.quizId])).toEqual([
      ["2", "live", "os-battle"],
      ["1", "finished", null],
    ]);
    expect(sessions[1]).toMatchObject({ accuracy: 0.62, startedAt: Date.parse("2026-09-21T06:26:00.000Z") });
  });

  it("reports a signed-out lecturer distinctly from an unreachable server", async () => {
    stubFetch(401, { error: "unauthorized" });
    await expect(fetchServerSessions()).rejects.toMatchObject({ code: "unauthorized" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))),
    );
    await expect(fetchServerSessions()).rejects.toBeInstanceOf(ServerSourceError);
  });
});

describe("fetchSessionEngineState", () => {
  const { engine } = simulateGame({ playedQuestions: 3, stopAt: "finished" });

  it("returns the validated engine state, bare or wrapped", async () => {
    const fetchMock = stubFetch(200, engine.state);
    const state = await fetchSessionEngineState("s 1");
    expect(state?.sessionId).toBe(engine.state.sessionId);
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/s%201/report", expect.anything());
    stubFetch(200, { state: engine.state });
    expect((await fetchSessionEngineState("s1"))?.roomCode).toBe(engine.state.roomCode);
  });

  it("is null for a session the server does not know, and an error for a malformed report", async () => {
    stubFetch(404, { error: "not_found" });
    expect(await fetchSessionEngineState("gone")).toBeNull();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    stubFetch(200, { ...engine.state, players: "nope" });
    await expect(fetchSessionEngineState("bad")).rejects.toMatchObject({ code: "unavailable" });
  });
});
