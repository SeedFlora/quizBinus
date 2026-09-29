import { describe, expect, it } from "vitest";
import { computeAchievements, DEFAULT_GRACE_MS, GameEngine, type CreateEngineInput } from "@/lib/game/engine";
import type { AnswerPayload, Question } from "@/lib/game/types";
import { deepKeys, question, quiz } from "../../fixtures/quiz";

const T0 = 1_700_000_000_000;

function makeEngine(questions: Question[], extra: Partial<CreateEngineInput> = {}) {
  return GameEngine.create({
    sessionId: "session-1",
    roomCode: "482913",
    hostName: "Bu Laras",
    quiz: quiz(questions),
    now: T0,
    ...extra,
  });
}

/** Joins players "p1".."pN" one second apart; nicknames are "Player 1".. */
function withPlayers(engine: GameEngine, count: number) {
  for (let i = 1; i <= count; i++) {
    const res = engine.addPlayer({ id: `p${i}`, nickname: `Player ${i}`, avatarSeed: `seed${i}` }, T0 + i * 1000);
    if (!res.ok) throw new Error(res.error);
  }
  return engine;
}

/** Starts the game and opens question 0 at `openAt`. */
function openFirst(engine: GameEngine, openAt = T0 + 60_000) {
  expect(engine.start(openAt - 3_000)).toEqual({ ok: true });
  expect(engine.openQuestion(openAt)).toEqual({ ok: true });
  return openAt;
}

const pick = (q: Question, index: number): AnswerPayload => ({ kind: "choice", answerIds: [q.answers[index]!.id] });
const right = (q: Question) =>
  pick(
    q,
    q.answers.findIndex((a) => a.isCorrect),
  );
const wrong = (q: Question) =>
  pick(
    q,
    q.answers.findIndex((a) => !a.isCorrect),
  );

const singles = (n: number, overrides: Partial<Question> = {}) =>
  Array.from({ length: n }, (_, i) =>
    question("single", { id: `s${i + 1}`, topic: `Topik ${(i % 2) + 1}`, ...overrides }),
  );

/* ------------------------------------------------------------------ */

describe("GameEngine: joining", () => {
  it("adds a fresh player with zeroed stats", () => {
    const engine = makeEngine(singles(1));
    const res = engine.addPlayer({ id: "p1", nickname: "Rara", avatarSeed: "x" }, T0 + 10);
    expect(res).toMatchObject({ ok: true, rejoined: false });
    expect(engine.state.players.p1).toMatchObject({
      nickname: "Rara",
      score: 0,
      streak: 0,
      bestStreak: 0,
      connected: true,
      kicked: false,
      joinedAt: T0 + 10,
    });
  });

  it("rejects a nickname already in use, case- and space-insensitively", () => {
    const engine = makeEngine(singles(1));
    engine.addPlayer({ id: "p1", nickname: "Rara Tiara", avatarSeed: "x" }, T0);
    for (const nickname of ["rara tiara", "RARA TIARA", "  Rara   Tiara "]) {
      expect(engine.addPlayer({ id: `dup-${nickname}`, nickname, avatarSeed: "y" }, T0)).toEqual({
        ok: false,
        error: "nickname_taken",
      });
    }
  });

  it("frees a kicked player's nickname for someone else", () => {
    const engine = withPlayers(makeEngine(singles(1)), 1);
    engine.kickPlayer("p1");
    expect(engine.addPlayer({ id: "p9", nickname: "player 1", avatarSeed: "z" }, T0).ok).toBe(true);
  });

  it("lets an existing player rejoin (reconnect) and marks them connected", () => {
    const engine = withPlayers(makeEngine(singles(1)), 1);
    engine.setConnected("p1", false);
    engine.setJoinsLocked(true);
    const res = engine.addPlayer({ id: "p1", nickname: "Player 1", avatarSeed: "seed1" }, T0 + 99);
    expect(res).toMatchObject({ ok: true, rejoined: true });
    expect(engine.state.players.p1!.connected).toBe(true);
  });

  it("refuses a kicked player trying to rejoin with the same id", () => {
    const engine = withPlayers(makeEngine(singles(1)), 1);
    engine.kickPlayer("p1");
    expect(engine.addPlayer({ id: "p1", nickname: "Player 1", avatarSeed: "seed1" }, T0)).toEqual({
      ok: false,
      error: "kicked",
    });
  });

  it("refuses new players when joins are locked", () => {
    const engine = withPlayers(makeEngine(singles(1)), 1);
    engine.setJoinsLocked(true);
    expect(engine.addPlayer({ id: "late", nickname: "Late", avatarSeed: "l" }, T0)).toEqual({
      ok: false,
      error: "locked",
    });
    engine.setJoinsLocked(false);
    expect(engine.addPlayer({ id: "late", nickname: "Late", avatarSeed: "l" }, T0).ok).toBe(true);
  });

  it("refuses new players when the room is full (kicked players free a seat)", () => {
    const engine = withPlayers(makeEngine(singles(1), { maxPlayers: 2 }), 2);
    expect(engine.addPlayer({ id: "p3", nickname: "Third", avatarSeed: "t" }, T0)).toEqual({
      ok: false,
      error: "full",
    });
    engine.kickPlayer("p2");
    expect(engine.addPlayer({ id: "p3", nickname: "Third", avatarSeed: "t" }, T0).ok).toBe(true);
  });

  it("refuses joins once the session ended, finished or expired", () => {
    const ended = makeEngine(singles(1));
    ended.end(T0);
    expect(ended.addPlayer({ id: "a", nickname: "Aa", avatarSeed: "a" }, T0)).toEqual({ ok: false, error: "ended" });

    const finished = makeEngine(singles(1));
    finished.finish(T0);
    expect(finished.addPlayer({ id: "a", nickname: "Aa", avatarSeed: "a" }, T0)).toEqual({ ok: false, error: "ended" });

    const expiring = makeEngine(singles(1), { ttlMs: 1_000 });
    expect(expiring.addPlayer({ id: "a", nickname: "Aa", avatarSeed: "a" }, T0 + 1_000).ok).toBe(true);
    expect(expiring.addPlayer({ id: "b", nickname: "Bb", avatarSeed: "b" }, T0 + 1_001)).toEqual({
      ok: false,
      error: "ended",
    });
  });

  it("allows late joiners mid-game unless locked", () => {
    const engine = withPlayers(makeEngine(singles(2)), 1);
    openFirst(engine);
    expect(engine.addPlayer({ id: "late", nickname: "Late", avatarSeed: "l" }, T0 + 70_000).ok).toBe(true);
  });

  it("frees the seat on leave in the lobby, but keeps the score mid-game", () => {
    const lobby = withPlayers(makeEngine(singles(1)), 2);
    lobby.removePlayer("p1");
    expect(lobby.state.players.p1).toBeUndefined();

    const live = withPlayers(makeEngine(singles(1)), 2);
    openFirst(live);
    live.removePlayer("p1");
    expect(live.state.players.p1).toMatchObject({ connected: false, kicked: false });
  });
});

/* ------------------------------------------------------------------ */

describe("GameEngine: flow", () => {
  it("cannot start without questions", () => {
    const engine = withPlayers(makeEngine([]), 1);
    expect(engine.start(T0)).toEqual({ ok: false, error: "no_questions" });
    expect(engine.state.phase).toBe("lobby");
  });

  it("start moves lobby → intro(0) exactly once", () => {
    const engine = withPlayers(makeEngine(singles(2)), 1);
    expect(engine.start(T0 + 5)).toEqual({ ok: true });
    expect(engine.state).toMatchObject({ phase: "intro", questionIndex: 0, startedAt: T0 + 5 });
    expect(engine.start(T0 + 6)).toEqual({ ok: false, error: "invalid_phase" });
  });

  it("openQuestion sets the deadline from the time limit", () => {
    const engine = withPlayers(makeEngine([question("single", { timeLimit: 30 })]), 1);
    expect(engine.openQuestion(T0)).toEqual({ ok: false, error: "invalid_phase" });
    engine.start(T0);
    engine.openQuestion(T0 + 3_000);
    expect(engine.state).toMatchObject({
      phase: "question",
      questionOpenedAt: T0 + 3_000,
      deadlineAt: T0 + 3_000 + 30_000,
      paused: false,
    });
    expect(engine.openQuestion(T0 + 4_000)).toEqual({ ok: false, error: "invalid_phase" });
  });

  it("next: reveal → intro(next) → … → finished after the last question", () => {
    const engine = withPlayers(makeEngine(singles(2)), 1);
    openFirst(engine);
    expect(engine.next(T0)).toEqual({ ok: false, error: "invalid_phase" }); // still open
    engine.closeQuestion(T0 + 70_000);
    expect(engine.next(T0 + 71_000)).toEqual({ ok: true });
    expect(engine.state).toMatchObject({ phase: "intro", questionIndex: 1, deadlineAt: null, questionOpenedAt: null });
    expect(engine.isLastQuestion).toBe(true);

    engine.openQuestion(T0 + 80_000);
    engine.closeQuestion(T0 + 90_000);
    expect(engine.showLeaderboardPhase()).toEqual({ ok: true });
    expect(engine.showLeaderboardPhase()).toEqual({ ok: false, error: "invalid_phase" });
    expect(engine.next(T0 + 95_000)).toEqual({ ok: true });
    expect(engine.state).toMatchObject({ phase: "finished", endedReason: "finished", endedAt: T0 + 95_000 });
    expect(engine.finish(T0 + 96_000)).toEqual({ ok: false, error: "invalid_phase" });
  });

  it("skip in the intro moves on without opening the question", () => {
    const engine = withPlayers(makeEngine(singles(3)), 1);
    engine.start(T0);
    expect(engine.skip(T0 + 1)).toEqual({ ok: true });
    expect(engine.state).toMatchObject({ phase: "intro", questionIndex: 1, skipped: ["s1"] });
  });

  it("skip during a question discards answers and scores nothing", () => {
    const engine = withPlayers(makeEngine(singles(2)), 2);
    const opened = openFirst(engine);
    const q = engine.currentQuestion!;
    engine.submitAnswer("p1", q.id, right(q), opened + 1_000);
    engine.pause(opened + 2_000);
    expect(engine.skip(opened + 3_000)).toEqual({ ok: true });
    expect(engine.state.answers[q.id]).toBeUndefined();
    expect(engine.state.players.p1!.score).toBe(0);
    expect(engine.state).toMatchObject({ phase: "intro", questionIndex: 1, paused: false, pausedRemainingMs: null });
    expect(engine.state.reveals[q.id]).toBeUndefined();
  });

  it("skip on the last question finishes the game; skip is invalid outside intro/question", () => {
    const engine = withPlayers(makeEngine(singles(1)), 1);
    openFirst(engine);
    engine.closeQuestion(T0 + 70_000);
    expect(engine.skip(T0 + 70_001)).toEqual({ ok: false, error: "invalid_phase" });

    const last = withPlayers(makeEngine(singles(1)), 1);
    last.start(T0);
    expect(last.skip(T0 + 1)).toEqual({ ok: true });
    expect(last.state.phase).toBe("finished");
  });

  it("end(host_ended) works from any live phase and only once", () => {
    const engine = withPlayers(makeEngine(singles(2)), 2);
    openFirst(engine);
    expect(engine.end(T0 + 65_000)).toEqual({ ok: true });
    expect(engine.state).toMatchObject({
      phase: "ended",
      endedReason: "host_ended",
      endedAt: T0 + 65_000,
      deadlineAt: null,
      paused: false,
    });
    // a leaderboard exists even if no question was ever closed
    expect(engine.state.leaderboard.map((e) => e.playerId)).toEqual(["p1", "p2"]);
    expect(engine.end(T0 + 66_000)).toEqual({ ok: false, error: "invalid_phase" });
    expect(engine.submitAnswer("p1", "s1", { kind: "choice", answerIds: ["s1-a2"] }, T0 + 66_000)).toEqual({
      status: "not_open",
    });
  });

  it("end can record an expiry reason", () => {
    const engine = makeEngine(singles(1));
    engine.end(T0, "expired");
    expect(engine.state.endedReason).toBe("expired");
  });
});

/* ------------------------------------------------------------------ */

describe("GameEngine: answers", () => {
  it("accepts an answer and measures response time from the open", () => {
    const engine = withPlayers(makeEngine(singles(1)), 1);
    const opened = openFirst(engine);
    const q = engine.currentQuestion!;
    expect(engine.submitAnswer("p1", q.id, right(q), opened + 4_321)).toEqual({
      status: "accepted",
      responseTimeMs: 4_321,
    });
    expect(engine.state.answers[q.id]!.p1).toMatchObject({ submittedAt: opened + 4_321, responseTimeMs: 4_321 });
  });

  it("prevents duplicate answers and keeps the first one", () => {
    const engine = withPlayers(makeEngine(singles(1)), 1);
    const opened = openFirst(engine);
    const q = engine.currentQuestion!;
    engine.submitAnswer("p1", q.id, wrong(q), opened + 1_000);
    expect(engine.submitAnswer("p1", q.id, right(q), opened + 1_100)).toEqual({ status: "duplicate" });
    expect(engine.state.answers[q.id]!.p1!.payload).toEqual(wrong(q));
  });

  it("accepts answers inside the network grace window, clamped to the time limit", () => {
    const engine = withPlayers(makeEngine(singles(1)), 2);
    const opened = openFirst(engine);
    const q = engine.currentQuestion!;
    const deadline = opened + q.timeLimit * 1000;
    expect(engine.submitAnswer("p1", q.id, right(q), deadline + DEFAULT_GRACE_MS)).toEqual({
      status: "accepted",
      responseTimeMs: q.timeLimit * 1000,
    });
    expect(engine.submitAnswer("p2", q.id, right(q), deadline + DEFAULT_GRACE_MS + 1)).toEqual({ status: "late" });
  });

  it("honours a custom grace window", () => {
    const engine = withPlayers(makeEngine(singles(1), { graceMs: 0 }), 1);
    const opened = openFirst(engine);
    const q = engine.currentQuestion!;
    expect(engine.submitAnswer("p1", q.id, right(q), opened + q.timeLimit * 1000 + 1)).toEqual({ status: "late" });
  });

  it("rejects structurally invalid payloads with a reason", () => {
    const engine = withPlayers(makeEngine(singles(1)), 1);
    const opened = openFirst(engine);
    const q = engine.currentQuestion!;
    expect(engine.submitAnswer("p1", q.id, { kind: "text", value: "FCFS" }, opened + 1)).toEqual({
      status: "invalid",
      reason: "expected_choice",
    });
    expect(engine.submitAnswer("p1", q.id, { kind: "choice", answerIds: ["ghost"] }, opened + 1)).toEqual({
      status: "invalid",
      reason: "unknown_answer",
    });
    // an invalid attempt does not burn the player's one answer
    expect(engine.submitAnswer("p1", q.id, right(q), opened + 2).status).toBe("accepted");
  });

  it("rejects unknown and kicked players", () => {
    const engine = withPlayers(makeEngine(singles(1)), 2);
    const opened = openFirst(engine);
    const q = engine.currentQuestion!;
    expect(engine.submitAnswer("ghost", q.id, right(q), opened + 1)).toEqual({
      status: "invalid",
      reason: "unknown_player",
    });
    engine.kickPlayer("p2");
    expect(engine.submitAnswer("p2", q.id, right(q), opened + 1)).toEqual({
      status: "invalid",
      reason: "unknown_player",
    });
  });

  it("answers are not_open outside an open question, for the wrong question, or while paused", () => {
    const engine = withPlayers(makeEngine(singles(2)), 1);
    const q1 = engine.questions[0]!;
    expect(engine.submitAnswer("p1", q1.id, right(q1), T0)).toEqual({ status: "not_open" }); // lobby
    engine.start(T0);
    expect(engine.submitAnswer("p1", q1.id, right(q1), T0)).toEqual({ status: "not_open" }); // intro
    engine.openQuestion(T0 + 1_000);
    expect(engine.submitAnswer("p1", "s2", right(engine.questions[1]!), T0 + 1_500)).toEqual({ status: "not_open" });
    engine.pause(T0 + 2_000);
    expect(engine.submitAnswer("p1", q1.id, right(q1), T0 + 2_500)).toEqual({ status: "not_open" });
    engine.resume(T0 + 3_000);
    expect(engine.submitAnswer("p1", q1.id, right(q1), T0 + 3_500).status).toBe("accepted");
    engine.closeQuestion(T0 + 4_000);
    expect(engine.submitAnswer("p1", q1.id, right(q1), T0 + 4_500)).toEqual({ status: "not_open" }); // reveal
  });

  it("counts answers from active players and knows when everyone connected has answered", () => {
    const engine = withPlayers(makeEngine(singles(1)), 3);
    const opened = openFirst(engine);
    const q = engine.currentQuestion!;
    engine.submitAnswer("p1", q.id, right(q), opened + 1);
    engine.submitAnswer("p2", q.id, right(q), opened + 2);
    expect(engine.answeredCount()).toBe(2);
    expect(engine.everyoneAnswered()).toBe(false);
    engine.setConnected("p3", false); // disconnected players are not waited for
    expect(engine.everyoneAnswered()).toBe(true);
    engine.kickPlayer("p2");
    expect(engine.answeredCount()).toBe(1);
  });
});

/* ------------------------------------------------------------------ */

describe("GameEngine: pause / resume", () => {
  it("freezes the remaining time and rejects double pause / idle resume", () => {
    const engine = withPlayers(makeEngine(singles(1)), 1);
    const opened = openFirst(engine);
    expect(engine.resume(opened + 1)).toEqual({ ok: false, error: "invalid_phase" });
    expect(engine.pause(opened + 5_000)).toEqual({ ok: true });
    expect(engine.state).toMatchObject({
      paused: true,
      pausedAt: opened + 5_000,
      pausedRemainingMs: 15_000,
      deadlineAt: null,
    });
    expect(engine.pause(opened + 6_000)).toEqual({ ok: false, error: "invalid_phase" });
  });

  it("resume restores the remaining time and excludes the pause from response times", () => {
    const engine = withPlayers(makeEngine(singles(1)), 1);
    const opened = openFirst(engine);
    const q = engine.currentQuestion!;
    engine.pause(opened + 5_000);
    engine.resume(opened + 65_000); // one-minute pause
    expect(engine.state).toMatchObject({
      paused: false,
      deadlineAt: opened + 65_000 + 15_000,
      pausedRemainingMs: null,
    });
    expect(engine.submitAnswer("p1", q.id, right(q), opened + 67_000)).toEqual({
      status: "accepted",
      responseTimeMs: 7_000,
    });
  });

  it("cannot pause outside an open question", () => {
    const engine = withPlayers(makeEngine(singles(1)), 1);
    expect(engine.pause(T0)).toEqual({ ok: false, error: "invalid_phase" });
    engine.start(T0);
    expect(engine.pause(T0)).toEqual({ ok: false, error: "invalid_phase" });
  });

  it("closing while paused clears the pause", () => {
    const engine = withPlayers(makeEngine(singles(1)), 1);
    const opened = openFirst(engine);
    engine.pause(opened + 1_000);
    expect(engine.closeQuestion(opened + 2_000)).toEqual({ ok: true });
    expect(engine.state).toMatchObject({ phase: "reveal", paused: false, pausedAt: null, pausedRemainingMs: null });
  });
});

/* ------------------------------------------------------------------ */

describe("GameEngine: closing, scoring and the leaderboard", () => {
  it("scores fast, slow, wrong and missing answers", () => {
    const engine = withPlayers(makeEngine(singles(1)), 4);
    const opened = openFirst(engine);
    const q = engine.currentQuestion!;
    engine.submitAnswer("p1", q.id, right(q), opened + 1_000); // inside grace → 1000
    engine.submitAnswer("p2", q.id, right(q), opened + 20_000); // last moment → 700
    engine.submitAnswer("p3", q.id, wrong(q), opened + 500);
    // p4 never answers
    expect(engine.closeQuestion(opened + 21_000)).toEqual({ ok: true });

    const scores = Object.fromEntries(Object.values(engine.state.players).map((p) => [p.id, p.score]));
    expect(scores).toEqual({ p1: 1000, p2: 700, p3: 0, p4: 0 });
    expect(engine.state.answers[q.id]!.p1).toMatchObject({ isCorrect: true, pointsAwarded: 1000, streakAfter: 1 });
    expect(engine.state.answers[q.id]!.p3).toMatchObject({ isCorrect: false, pointsAwarded: 0, streakAfter: 0 });
    expect(engine.state.players.p1).toMatchObject({ answeredCount: 1, correctCount: 1, totalResponseMs: 1_000 });
    expect(engine.state.players.p3).toMatchObject({ answeredCount: 1, correctCount: 0, totalResponseMs: 0 });
    expect(engine.state.players.p4).toMatchObject({ answeredCount: 0, streak: 0 });
    expect(engine.closeQuestion(opened + 22_000)).toEqual({ ok: false, error: "invalid_phase" });
  });

  it("builds a reveal with distribution, stats and per-player results", () => {
    const engine = withPlayers(makeEngine(singles(1)), 4);
    const opened = openFirst(engine);
    const q = engine.currentQuestion!;
    engine.submitAnswer("p1", q.id, right(q), opened + 1_000);
    engine.submitAnswer("p2", q.id, right(q), opened + 3_000);
    engine.submitAnswer("p3", q.id, pick(q, 0), opened + 2_000);
    engine.closeQuestion(opened + 21_000);

    const reveal = engine.state.reveals[q.id]!;
    expect(reveal.correctAnswerIds).toEqual([q.answers[1]!.id]);
    expect(reveal.distribution).toEqual([
      { answerId: q.answers[0]!.id, count: 1 },
      { answerId: q.answers[1]!.id, count: 2 },
      { answerId: q.answers[2]!.id, count: 0 },
      { answerId: q.answers[3]!.id, count: 0 },
    ]);
    expect(reveal.stats).toEqual({
      answered: 3,
      correct: 2,
      accuracy: 2 / 3,
      averageResponseMs: 2_000,
      fastestPlayer: { nickname: "Player 1", responseTimeMs: 1_000 },
    });
    expect(reveal.results.p1).toMatchObject({
      answered: true,
      isCorrect: true,
      pointsAwarded: 1000,
      rank: 1,
      score: 1000,
    });
    expect(reveal.results.p4).toMatchObject({
      answered: false,
      isCorrect: false,
      pointsAwarded: 0,
      responseTimeMs: null,
    });
  });

  it("grows streaks across questions, adds the streak bonus and resets on a miss or no-answer", () => {
    const engine = withPlayers(makeEngine(singles(4)), 2);
    let now = openFirst(engine);
    const play = (answers: Record<string, "right" | "wrong" | null>) => {
      const q = engine.currentQuestion!;
      for (const [pid, kind] of Object.entries(answers)) {
        if (kind) engine.submitAnswer(pid, q.id, kind === "right" ? right(q) : wrong(q), now + 500);
      }
      engine.closeQuestion(now + 21_000);
      now += 30_000;
      if (!engine.isLastQuestion) {
        engine.next(now);
        engine.openQuestion(now);
      }
    };
    play({ p1: "right", p2: "right" });
    play({ p1: "right", p2: null }); // p2 misses by not answering
    expect(engine.state.players.p1).toMatchObject({ streak: 2, score: 1000 + 1050 });
    expect(engine.state.players.p2).toMatchObject({ streak: 0, bestStreak: 1 });
    play({ p1: "right", p2: "right" });
    expect(engine.state.players.p1).toMatchObject({ streak: 3, score: 1000 + 1050 + 1100 });
    play({ p1: "wrong", p2: "right" });
    expect(engine.state.players.p1).toMatchObject({ streak: 0, bestStreak: 3 });
    expect(engine.state.players.p2).toMatchObject({ streak: 2 });
  });

  it("polls are unscored: no points, no streak change, not counted as answered", () => {
    const engine = withPlayers(makeEngine([question("single", { id: "q1" }), question("poll", { id: "poll" })]), 2);
    let now = openFirst(engine);
    const q1 = engine.currentQuestion!;
    engine.submitAnswer("p1", q1.id, right(q1), now + 500);
    engine.submitAnswer("p2", q1.id, right(q1), now + 500);
    engine.closeQuestion(now + 21_000);
    now += 30_000;
    engine.next(now);
    engine.openQuestion(now);
    const poll = engine.currentQuestion!;
    engine.submitAnswer("p1", poll.id, pick(poll, 2), now + 500); // p2 skips the poll
    engine.closeQuestion(now + 21_000);

    expect(engine.state.players.p1).toMatchObject({ score: 1000, streak: 1, answeredCount: 1 });
    expect(engine.state.players.p2).toMatchObject({ score: 1000, streak: 1, answeredCount: 1 });
    const reveal = engine.state.reveals[poll.id]!;
    expect(reveal.correctAnswerIds).toEqual([]);
    expect(reveal.distribution.find((d) => d.answerId === poll.answers[2]!.id)?.count).toBe(1);
    expect(reveal.results.p1).toMatchObject({ answered: true, isCorrect: false, pointsAwarded: 0 });
  });

  it("zero-point warm-ups do not break streaks when skipped by a player", () => {
    const engine = withPlayers(
      makeEngine([question("single", { id: "a" }), question("single", { id: "warm", points: 0 })]),
      1,
    );
    let now = openFirst(engine);
    engine.submitAnswer("p1", "a", right(engine.currentQuestion!), now + 500);
    engine.closeQuestion(now + 21_000);
    now += 30_000;
    engine.next(now);
    engine.openQuestion(now);
    engine.closeQuestion(now + 21_000); // p1 did not answer the warm-up
    expect(engine.state.players.p1).toMatchObject({ streak: 1, score: 1000 });
  });

  it("gives partial credit on multiple-select without growing the streak", () => {
    const engine = withPlayers(makeEngine([question("multiple", { id: "m", correct: [0, 1, 3] })]), 1);
    const opened = openFirst(engine);
    const q = engine.currentQuestion!;
    engine.submitAnswer("p1", q.id, { kind: "choice", answerIds: [q.answers[0]!.id, q.answers[1]!.id] }, opened + 500);
    engine.closeQuestion(opened + 21_000);
    expect(engine.state.players.p1).toMatchObject({ score: 667, streak: 0, correctCount: 0, answeredCount: 1 });
    expect(engine.state.reveals.m!.results.p1).toMatchObject({ isCorrect: false, pointsAwarded: 667 });
  });

  it("orders the leaderboard by score, then faster correct time, then earlier join", () => {
    const engine = withPlayers(makeEngine(singles(1)), 4);
    const opened = openFirst(engine);
    const q = engine.currentQuestion!;
    // All four inside the grace window → identical 1000 points.
    engine.submitAnswer("p4", q.id, right(q), opened + 1_500);
    engine.submitAnswer("p3", q.id, right(q), opened + 900);
    engine.submitAnswer("p2", q.id, right(q), opened + 1_500);
    engine.submitAnswer("p1", q.id, right(q), opened + 1_800);
    engine.closeQuestion(opened + 21_000);
    const board = engine.state.leaderboard;
    expect(board.map((e) => e.playerId)).toEqual(["p3", "p2", "p4", "p1"]);
    expect(board.map((e) => e.rank)).toEqual([1, 2, 3, 4]);
    expect(board.every((e) => e.score === 1000 && e.previousRank === null && e.lastPoints === 1000)).toBe(true);
  });

  it("tracks previousRank, lastPoints and rank climbs across questions", () => {
    const engine = withPlayers(makeEngine(singles(2)), 3);
    let now = openFirst(engine);
    let q = engine.currentQuestion!;
    engine.submitAnswer("p1", q.id, right(q), now + 500);
    engine.submitAnswer("p2", q.id, right(q), now + 15_000);
    engine.closeQuestion(now + 21_000);
    expect(engine.state.leaderboard.map((e) => e.playerId)).toEqual(["p1", "p2", "p3"]);

    now += 30_000;
    engine.next(now);
    engine.openQuestion(now);
    q = engine.currentQuestion!;
    q = { ...q, points: 2000 };
    engine.state.quiz.questions[1] = q; // double points question
    engine.submitAnswer("p3", q.id, right(q), now + 500);
    engine.closeQuestion(now + 21_000);

    const byId = Object.fromEntries(engine.state.leaderboard.map((e) => [e.playerId, e]));
    expect(byId.p3).toMatchObject({ rank: 1, previousRank: 3, lastPoints: 2000, score: 2000 });
    expect(byId.p1).toMatchObject({ rank: 2, previousRank: 1, lastPoints: 0 });
    expect(byId.p2).toMatchObject({ rank: 3, previousRank: 2, lastPoints: 0 });
    expect(engine.state.bestClimb).toMatchObject({ p3: 2, p1: 0 });
  });

  it("removes kicked players from the leaderboard and from results", () => {
    const engine = withPlayers(makeEngine(singles(2)), 2);
    const opened = openFirst(engine);
    const q = engine.currentQuestion!;
    engine.submitAnswer("p2", q.id, right(q), opened + 500);
    engine.closeQuestion(opened + 21_000);
    expect(engine.kickPlayer("p2")).toBe(true);
    expect(engine.kickPlayer("nobody")).toBe(false);
    expect(engine.state.leaderboard.map((e) => e.playerId)).toEqual(["p1"]);
  });
});

/* ------------------------------------------------------------------ */

describe("GameEngine: snapshotFor (what leaves the engine)", () => {
  const FORBIDDEN = ["isCorrect", "correctAnswerIds", "acceptedAnswers", "numeric", "explanation", "correctText"];

  function expectSanitized(value: unknown) {
    const keys = deepKeys(value);
    for (const k of FORBIDDEN) expect(keys.has(k), `snapshot leaked "${k}"`).toBe(false);
  }

  it("lobby snapshot lists active players in join order with no question", () => {
    const engine = withPlayers(makeEngine(singles(2)), 3);
    engine.kickPlayer("p2");
    const snap = engine.snapshotFor(T0 + 5_000);
    expect(snap).toMatchObject({
      sessionId: "session-1",
      roomCode: "482913",
      quizTitle: "Kuis Uji",
      courseCode: "COMP6716",
      hostName: "Bu Laras",
      phase: "lobby",
      questionIndex: -1,
      totalQuestions: 2,
      question: null,
      reveal: null,
      upcoming: null,
      serverNow: T0 + 5_000,
    });
    expect(snap.players.map((p) => p.id)).toEqual(["p1", "p3"]);
    expect(Object.keys(snap.players[0]!).sort()).toEqual(["avatarSeed", "id", "nickname", "teamId"]);
    expect(snap.self).toBeUndefined();
  });

  it("intro snapshot reveals only index/topic/points — never the prompt or answers", () => {
    const engine = withPlayers(makeEngine(singles(2)), 1);
    engine.start(T0);
    const snap = engine.snapshotFor(T0);
    expect(snap.question).toBeNull();
    expect(snap.upcoming).toEqual({
      index: 0,
      total: 2,
      topic: "Topik 1",
      points: 1000,
      timeLimit: 20,
      isFinal: false,
    });
    expect(JSON.stringify(snap)).not.toContain(engine.questions[0]!.prompt);
    engine.skip(T0 + 1);
    expect(engine.snapshotFor(T0 + 1).upcoming?.isFinal).toBe(true);
  });

  it.each(["single", "multiple", "true_false", "short_answer", "numeric", "ordering", "poll"] as const)(
    "open %s question snapshots carry no correctness data, for host and players",
    (type) => {
      const engine = withPlayers(makeEngine([question(type, { explanation: "Rahasia" })]), 2);
      const opened = openFirst(engine);
      const q = engine.currentQuestion!;
      if (q.answers.length)
        engine.submitAnswer("p1", q.id, { kind: "choice", answerIds: [q.answers[0]!.id] }, opened + 10);

      for (const snap of [
        engine.snapshotFor(opened + 20),
        engine.snapshotFor(opened + 20, "p1"),
        engine.snapshotFor(opened + 20, "p2"),
      ]) {
        expectSanitized(snap);
        expect(snap.reveal).toBeNull();
        expect(snap.question?.id).toBe(q.id);
        expect(JSON.stringify(snap)).not.toContain("Rahasia");
      }
    },
  );

  it("does not leak the previous reveal while the next question is open", () => {
    const engine = withPlayers(makeEngine(singles(2)), 1);
    let now = openFirst(engine);
    engine.submitAnswer("p1", "s1", right(engine.currentQuestion!), now + 500);
    engine.closeQuestion(now + 21_000);
    now += 30_000;
    engine.next(now);
    engine.openQuestion(now);
    const snap = engine.snapshotFor(now + 1, "p1");
    expect(snap.reveal).toBeNull();
    expectSanitized(snap);
    expect(snap.leaderboard[0]).toMatchObject({ playerId: "p1", score: 1000 });
  });

  it("includes the reveal only after the question closes (reveal and leaderboard phases)", () => {
    const engine = withPlayers(makeEngine(singles(2)), 1);
    const opened = openFirst(engine);
    const q = engine.currentQuestion!;
    engine.closeQuestion(opened + 21_000);
    const reveal = engine.snapshotFor(opened + 21_000);
    expect(reveal.phase).toBe("reveal");
    expect(reveal.reveal?.correctAnswerIds).toEqual([q.answers[1]!.id]);
    expect(reveal.question?.id).toBe(q.id);
    engine.showLeaderboardPhase();
    expect(engine.snapshotFor(opened + 22_000).reveal?.questionId).toBe(q.id);
  });

  it("adds the requesting player's own `self` block with their current answer", () => {
    const engine = withPlayers(makeEngine(singles(1)), 2);
    const opened = openFirst(engine);
    const q = engine.currentQuestion!;
    engine.submitAnswer("p1", q.id, right(q), opened + 700);
    const mine = engine.snapshotFor(opened + 800, "p1");
    expect(mine.self).toEqual({
      playerId: "p1",
      nickname: "Player 1",
      avatarSeed: "seed1",
      score: 0,
      streak: 0,
      rank: null,
      currentAnswer: right(q),
      kicked: false,
    });
    expect(engine.snapshotFor(opened + 800, "p2").self?.currentAnswer).toBeNull();
    expect(engine.snapshotFor(opened + 800).self).toBeUndefined();
    expect(engine.snapshotFor(opened + 800, "ghost").self).toBeUndefined();
    expect(mine.answeredCount).toBe(1);

    engine.closeQuestion(opened + 21_000);
    expect(engine.snapshotFor(opened + 21_000, "p1").self).toMatchObject({ score: 1000, streak: 1, rank: 1 });
  });

  it("flags a kicked player in their own snapshot", () => {
    const engine = withPlayers(makeEngine(singles(1)), 2);
    engine.kickPlayer("p2");
    expect(engine.snapshotFor(T0, "p2").self?.kicked).toBe(true);
    expect(engine.snapshotFor(T0).players.map((p) => p.id)).toEqual(["p1"]);
  });

  it("reports pause state and the end reason", () => {
    const engine = withPlayers(makeEngine(singles(1)), 1);
    const opened = openFirst(engine);
    engine.pause(opened + 4_000);
    expect(engine.snapshotFor(opened + 4_000)).toMatchObject({
      paused: true,
      deadlineAt: null,
      pausedRemainingMs: 16_000,
    });
    engine.end(opened + 5_000);
    expect(engine.snapshotFor(opened + 5_000)).toMatchObject({ phase: "ended", endedReason: "host_ended" });
  });
});

/* ------------------------------------------------------------------ */

describe("GameEngine: summaryFor and achievements", () => {
  function playAll(
    engine: GameEngine,
    answer: (q: Question, pid: string) => { payload: AnswerPayload; at: number } | null,
  ) {
    let now = openFirst(engine);
    for (;;) {
      const q = engine.currentQuestion!;
      for (const pid of Object.keys(engine.state.players)) {
        const a = answer(q, pid);
        if (a) engine.submitAnswer(pid, q.id, a.payload, now + a.at);
      }
      engine.closeQuestion(now + 21_000);
      now += 30_000;
      engine.next(now);
      if (engine.state.phase === "finished") return;
      engine.openQuestion(now);
    }
  }

  it("summarises a perfect, fast run with the matching achievements", () => {
    const engine = withPlayers(makeEngine(singles(5)), 2);
    playAll(engine, (q, pid) => (pid === "p1" ? { payload: right(q), at: 1_500 } : { payload: wrong(q), at: 9_000 }));

    const s = engine.summaryFor("p1")!;
    expect(s).toMatchObject({
      playerId: "p1",
      rank: 1,
      totalPlayers: 2,
      accuracy: 1,
      answered: 5,
      correct: 5,
      averageResponseMs: 1_500,
      bestStreak: 5,
    });
    expect(s.score).toBe(1000 + 1050 + 1100 + 1150 + 1200);
    expect(s.strongestTopic).toBe("Topik 1"); // tie on accuracy → more correct answers wins (3 vs 2)
    expect([...s.achievements].sort()).toEqual(["accuracy", "fast", "first", "perfect", "streak", "top3"]);

    const loser = engine.summaryFor("p2")!;
    expect(loser).toMatchObject({ rank: 2, accuracy: 0, answered: 5, correct: 0, strongestTopic: null, score: 0 });
    expect(loser.achievements).toEqual(["top3"]);
  });

  it("excludes polls and skipped questions and handles players who never answered", () => {
    const engine = withPlayers(
      makeEngine([
        question("single", { id: "a", topic: "FCFS" }),
        question("poll", { id: "p" }),
        question("single", { id: "b", topic: "RR" }),
      ]),
      2,
    );
    let now = openFirst(engine);
    engine.submitAnswer("p1", "a", right(engine.currentQuestion!), now + 3_000);
    engine.closeQuestion(now + 21_000);
    now += 30_000;
    engine.next(now);
    engine.openQuestion(now);
    engine.submitAnswer("p1", "p", pick(engine.currentQuestion!, 0), now + 100);
    engine.closeQuestion(now + 21_000);
    now += 30_000;
    engine.next(now);
    engine.skip(now); // "b" skipped → finished
    expect(engine.state.phase).toBe("finished");

    const s = engine.summaryFor("p1")!;
    expect(s).toMatchObject({ answered: 1, correct: 1, accuracy: 1, averageResponseMs: 3_000, strongestTopic: "FCFS" });
    expect(s.achievements).toContain("perfect");
    expect(s.achievements).not.toContain("fast");

    const idle = engine.summaryFor("p2")!;
    expect(idle).toMatchObject({ answered: 0, correct: 0, accuracy: 0, averageResponseMs: null });
    expect(engine.summaryFor("nobody")).toBeNull();
  });

  it("computeAchievements applies each threshold", () => {
    const base = { rank: 10, accuracy: 0.5, correct: 2, bestStreak: 1 };
    const extra = { fastestCorrectMs: null, bestClimb: 0, scoredQuestions: 4 };
    expect(computeAchievements(base, extra)).toEqual([]);
    expect(computeAchievements(base, { ...extra, fastestCorrectMs: 2_000 })).toEqual(["fast"]);
    expect(computeAchievements(base, { ...extra, fastestCorrectMs: 2_001 })).toEqual([]);
    expect(computeAchievements(base, { ...extra, bestClimb: 5 })).toEqual(["comeback"]);
    expect(computeAchievements({ ...base, bestStreak: 5 }, extra)).toEqual(["streak"]);
    expect(computeAchievements({ ...base, rank: 3 }, extra)).toEqual(["top3"]);
    expect(computeAchievements({ ...base, rank: 1 }, extra)).toEqual(["first", "top3"]);
    expect(computeAchievements({ ...base, accuracy: 0.9 }, extra)).toEqual(["accuracy"]);
    expect(computeAchievements({ ...base, correct: 4, accuracy: 1 }, extra)).toEqual(["perfect", "accuracy"]);
    // nothing to be perfect at
    expect(computeAchievements({ ...base, correct: 0, accuracy: 0 }, { ...extra, scoredQuestions: 0 })).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */

describe("GameEngine: persistence", () => {
  it("serialize/restore round-trips and deep-copies state", () => {
    const engine = withPlayers(makeEngine(singles(2)), 2);
    const opened = openFirst(engine);
    engine.submitAnswer("p1", "s1", right(engine.currentQuestion!), opened + 500);
    const saved = engine.serialize();
    const restored = GameEngine.restore(saved);
    expect(restored.state).toEqual(engine.state);
    restored.state.players.p1!.score = 999;
    expect(engine.state.players.p1!.score).toBe(0);
    expect(saved.players.p1!.score).toBe(0);
    // the restored engine keeps working
    expect(restored.closeQuestion(opened + 21_000)).toEqual({ ok: true });
  });
});
