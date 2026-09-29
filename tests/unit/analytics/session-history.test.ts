import { afterEach, describe, expect, it, vi } from "vitest";
import { listSessionHistory, teachingPulse, type SessionRecord } from "@/components/creator/data";
import { simulateGame } from "@/lib/demo/simulate";
import { DEMO_HISTORY_PREFIX } from "@/lib/demo/history";

const NOW = Date.parse("2026-09-28T08:00:00.000Z");
const { engine } = simulateGame({ playedQuestions: 4, stopAt: "finished", sessionId: "s-new", roomCode: "425060" });

/** A lecturer with one fresh session (full report available) and one old one (summary only). */
function stubServer({ reportFor = ["s-new"] }: { reportFor?: string[] } = {}) {
  const rows = [
    {
      id: "s-new",
      quizId: engine.state.quiz.id,
      quizTitle: engine.state.quiz.title,
      courseCode: "COMP6716",
      roomCode: "425060",
      status: "finished",
      players: 42,
      accuracy: 0.7,
      startedAt: "2026-09-28T06:26:00.000Z",
      endedAt: "2026-09-28T06:41:00.000Z",
      createdAt: "2026-09-28T06:20:00.000Z",
    },
    ...Array.from({ length: 9 }, (_, i) => ({
      id: `s-old-${i}`,
      quizId: null,
      quizTitle: "Kuis lama",
      courseCode: "COMP6153",
      roomCode: "731604",
      status: "ended",
      players: 30,
      accuracy: 0.5,
      startedAt: `2026-08-${10 + i}T06:26:00.000Z`,
      endedAt: null,
      createdAt: `2026-08-${10 + i}T06:20:00.000Z`,
    })),
    // Closed before it started: noise, not history.
    {
      id: "s-empty",
      quizId: "q",
      quizTitle: "x",
      courseCode: "",
      roomCode: "1",
      status: "ended",
      players: 0,
      accuracy: null,
      startedAt: null,
      endedAt: null,
      createdAt: "2026-09-27T01:00:00.000Z",
    },
  ];
  const fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/sessions") return new Response(JSON.stringify(rows), { status: 200 });
    const id = decodeURIComponent(url.split("/")[3] ?? "");
    if (reportFor.includes(id))
      return new Response(JSON.stringify({ ...engine.state, sessionId: id }), { status: 200 });
    return new Response(JSON.stringify({ ok: false, error: "not_found" }), { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("listSessionHistory (database)", () => {
  it("details the newest sessions from their report and keeps older ones as summaries", async () => {
    const fetchMock = stubServer();
    const records = await listSessionHistory("database", NOW);
    expect(records.map((r) => r.id)).toEqual(["s-new", ...Array.from({ length: 9 }, (_, i) => `s-old-${8 - i}`)]);
    const [fresh, ...old] = records as [SessionRecord, ...SessionRecord[]];
    expect(fresh).toMatchObject({
      status: "ended",
      totalQuestions: engine.state.quiz.questions.length,
      questionsPlayed: 4,
    });
    expect(fresh.expected).toBeGreaterThan(0);
    // A deleted quiz still links to a report (the session carries its quiz snapshot).
    expect(old[0]).toMatchObject({ quizId: "s-old-8", accuracy: 0.5, expected: 0, totalQuestions: 0 });
    // Only the newest few are fetched in full, never the whole history.
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/report"))).toHaveLength(8);
    expect(records.some((r) => r.demo)).toBe(false);
  });

  it("fails loudly in database mode so the page can offer a retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 401 })),
    );
    await expect(listSessionHistory("database", NOW)).rejects.toMatchObject({ code: "unauthorized" });
  });
});

describe("listSessionHistory (browser)", () => {
  it("adds the game server's sessions to the demo history, and survives a server that is down", async () => {
    stubServer();
    const records = await listSessionHistory("browser", NOW);
    expect(records[0]?.id).toBe("s-new");
    expect(records.filter((r) => r.id.startsWith(DEMO_HISTORY_PREFIX)).length).toBeGreaterThan(0);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))),
    );
    const offline = await listSessionHistory("browser", NOW);
    expect(offline.length).toBeGreaterThan(0);
    expect(offline.every((r) => r.demo)).toBe(true);
  });
});

describe("teachingPulse", () => {
  const record = (over: Partial<SessionRecord>): SessionRecord => ({
    id: "s",
    quizId: "q",
    quizTitle: "Kuis",
    courseCode: "COMP6716",
    courseName: "",
    roomCode: "425060",
    status: "ended",
    players: 30,
    questionsPlayed: 0,
    totalQuestions: 0,
    accuracy: null,
    participation: null,
    answered: 0,
    expected: 0,
    correct: 0,
    hardestTopic: null,
    startedAt: NOW - 86_400_000,
    endedAt: null,
    demo: false,
    ...over,
  });

  it("falls back to summaries weighted by class size when no session has detail", () => {
    const pulse = teachingPulse([record({ players: 42, accuracy: 0.7 }), record({ players: 30, accuracy: 0.5 })], NOW);
    expect(pulse.accuracy).toBeCloseTo((42 * 0.7 + 30 * 0.5) / 72);
    expect(pulse.engagement).toBeNull();
    expect(pulse.sessionsMeasured).toBe(2);
  });

  it("prefers detailed sessions over summaries", () => {
    const detailed = record({ answered: 90, expected: 100, correct: 45, accuracy: 0.5 });
    const pulse = teachingPulse([detailed, record({ players: 40, accuracy: 0.9 })], NOW);
    expect(pulse.accuracy).toBeCloseTo(0.5);
    expect(pulse.engagement).toBeCloseTo(0.9);
    expect(pulse.sessionsMeasured).toBe(1);
    expect(pulse.students).toBe(70);
  });
});
