import { describe, expect, it } from "vitest";
import {
  demoSnapshot,
  DEMO_EPOCH,
  DEMO_ROOM_CODE,
  DEMO_SESSION_ID,
  simulateGame,
  simulatedAnswer,
} from "@/lib/demo/simulate";
import { validatePayload } from "@/lib/game/evaluate";
import type { SessionSnapshot } from "@/lib/game/types";
import { DEMO_PLAYERS, DEMO_SELF } from "@/lib/seed/players";
import { OS_BATTLE, SEED_QUIZZES } from "@/lib/seed/quizzes";
import { deepKeys } from "../../fixtures/quiz";

/** Invariants every leaderboard-bearing snapshot must satisfy. */
function expectConsistentLeaderboard(snap: SessionSnapshot) {
  const board = snap.leaderboard;
  expect(board.map((e) => e.rank)).toEqual(board.map((_, i) => i + 1));
  for (let i = 1; i < board.length; i++) expect(board[i - 1]!.score).toBeGreaterThanOrEqual(board[i]!.score);
  expect(new Set(board.map((e) => e.playerId)).size).toBe(board.length);
}

describe("simulateGame / demoSnapshot", () => {
  it("lobby: every demo student has joined, nothing else happened", () => {
    const s = demoSnapshot({ playedQuestions: 0, stopAt: "lobby" });
    expect(s).toMatchObject({
      sessionId: DEMO_SESSION_ID,
      roomCode: DEMO_ROOM_CODE,
      phase: "lobby",
      questionIndex: -1,
      question: null,
      reveal: null,
      leaderboard: [],
      totalQuestions: OS_BATTLE.questions.length,
    });
    expect(s.players).toHaveLength(DEMO_PLAYERS.length);
    expect(s.serverNow).toBeGreaterThan(DEMO_EPOCH);
  });

  it("intro: points at the next question without revealing it", () => {
    const s = demoSnapshot({ playedQuestions: 2, stopAt: "intro" });
    expect(s).toMatchObject({ phase: "intro", questionIndex: 2, question: null, reveal: null });
    expect(s.upcoming).toMatchObject({ index: 2, total: 10, isFinal: false, topic: OS_BATTLE.questions[2]!.topic });
    expectConsistentLeaderboard(s);
  });

  it("question: exactly N answered, the clock is running, nothing leaks", () => {
    const s = demoSnapshot({ playedQuestions: 3, stopAt: "question", answeredInOpenQuestion: 12, as: "self" });
    expect(s).toMatchObject({ phase: "question", questionIndex: 3, answeredCount: 12, reveal: null, paused: false });
    expect(s.question?.id).toBe(OS_BATTLE.questions[3]!.id);
    expect(s.deadlineAt! - s.serverNow).toBe(OS_BATTLE.questions[3]!.timeLimit * 1000 - 7_000);
    expect(deepKeys(s).has("isCorrect")).toBe(false);
    expect(deepKeys(s).has("correctAnswerIds")).toBe(false);
    expect(s.self?.playerId).toBe(DEMO_SELF.id);
  });

  it("reveal: distribution, stats, results and leaderboard agree with each other", () => {
    const s = demoSnapshot({ playedQuestions: 4, stopAt: "reveal" });
    expect(s.phase).toBe("reveal");
    const reveal = s.reveal!;
    expect(reveal.questionId).toBe(OS_BATTLE.questions[3]!.id);

    const results = Object.values(reveal.results);
    expect(results).toHaveLength(DEMO_PLAYERS.length);
    const answered = results.filter((r) => r.answered);
    expect(reveal.stats.answered).toBe(answered.length);
    expect(reveal.stats.correct).toBe(answered.filter((r) => r.isCorrect).length);
    // single choice: one pick per answer
    expect(reveal.distribution.reduce((sum, d) => sum + d.count, 0)).toBe(answered.length);
    // a realistic class: most answer, some are right, some are wrong
    expect(answered.length).toBeGreaterThan(DEMO_PLAYERS.length * 0.8);
    expect(reveal.stats.accuracy).toBeGreaterThan(0.2);
    expect(reveal.stats.accuracy).toBeLessThan(1);

    expectConsistentLeaderboard(s);
    for (const entry of s.leaderboard) {
      expect(reveal.results[entry.playerId]).toMatchObject({ score: entry.score, rank: entry.rank });
      expect(entry.previousRank).not.toBeNull();
    }
  });

  it("scores equal the sum of awarded points across every played question", () => {
    const { engine } = simulateGame({ playedQuestions: 5, stopAt: "reveal" });
    for (const player of Object.values(engine.state.players)) {
      const sum = Object.values(engine.state.answers).reduce(
        (acc, bucket) => acc + (bucket[player.id]?.pointsAwarded ?? 0),
        0,
      );
      expect(player.score).toBe(sum);
    }
  });

  it("leaderboard: same numbers as the reveal, in the leaderboard phase", () => {
    const reveal = demoSnapshot({ playedQuestions: 6, stopAt: "reveal" });
    const board = demoSnapshot({ playedQuestions: 6, stopAt: "leaderboard" });
    expect(board.phase).toBe("leaderboard");
    expect(board.leaderboard).toEqual(reveal.leaderboard);
    expect(board.reveal).toEqual(reveal.reveal);
  });

  it("finished: a full game ends with consistent personal summaries", () => {
    const { engine, now } = simulateGame({ playedQuestions: OS_BATTLE.questions.length, stopAt: "finished" });
    const s = engine.snapshotFor(now);
    expect(s).toMatchObject({ phase: "finished", endedReason: "finished", questionIndex: 9 });
    expectConsistentLeaderboard(s);

    const ranks = new Set<number>();
    for (const entry of s.leaderboard) {
      const summary = engine.summaryFor(entry.playerId)!;
      expect(summary).toMatchObject({ rank: entry.rank, score: entry.score, totalPlayers: DEMO_PLAYERS.length });
      expect(summary.correct).toBeLessThanOrEqual(summary.answered);
      expect(summary.accuracy).toBeCloseTo(summary.correct / OS_BATTLE.questions.length);
      ranks.add(summary.rank);
    }
    expect(ranks.size).toBe(DEMO_PLAYERS.length);
    expect(engine.summaryFor(s.leaderboard[0]!.playerId)!.achievements).toEqual(
      expect.arrayContaining(["first", "top3"]),
    );
  });

  it("is deterministic for the same options and varies with the salt", () => {
    const a = demoSnapshot({ playedQuestions: 3, stopAt: "leaderboard" });
    const b = demoSnapshot({ playedQuestions: 3, stopAt: "leaderboard" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = demoSnapshot({ playedQuestions: 3, stopAt: "leaderboard", salt: "other" });
    expect(c.leaderboard.map((e) => e.score)).not.toEqual(a.leaderboard.map((e) => e.score));
  });

  it("selfCorrect makes the demo student right on the last played question", () => {
    for (let n = 1; n <= 4; n++) {
      const s = demoSnapshot({ playedQuestions: n, stopAt: "reveal", selfCorrect: true, as: "self" });
      expect(s.reveal!.results[DEMO_SELF.id]).toMatchObject({ answered: true, isCorrect: true });
    }
  });

  it.each(SEED_QUIZZES.map((q) => [q.id, q] as const))(
    "selfCorrect works for every question type in %s",
    (_id, quiz) => {
      quiz.questions.forEach((q, i) => {
        if (q.type === "poll") return;
        const s = demoSnapshot({ quiz, playedQuestions: i + 1, stopAt: "reveal", selfCorrect: true, as: "self" });
        expect(s.reveal!.results[DEMO_SELF.id], `${q.type} ${q.id}`).toMatchObject({ answered: true, isCorrect: true });
      });
    },
  );

  it("runs any seed quiz end-to-end with custom players", () => {
    const players = DEMO_PLAYERS.slice(0, 5);
    for (const quiz of SEED_QUIZZES) {
      const { engine } = simulateGame({ quiz, players, playedQuestions: quiz.questions.length, stopAt: "finished" });
      expect(engine.state.phase).toBe("finished");
      expect(engine.activePlayers()).toHaveLength(5);
    }
  });
});

describe("simulatedAnswer", () => {
  it("always produces a structurally valid payload, for every seeded question type", () => {
    for (const quiz of SEED_QUIZZES) {
      for (const q of quiz.questions) {
        for (const p of DEMO_PLAYERS) {
          const sim = simulatedAnswer(q, p.id, "nusa");
          if (!sim) continue;
          expect(validatePayload(q, sim.payload), `${q.id} ${p.id}`).toBeNull();
          expect(sim.responseMs).toBeGreaterThan(0);
          expect(sim.responseMs).toBeLessThanOrEqual(q.timeLimit * 1000);
        }
      }
    }
  });

  it("is deterministic per question, player and salt", () => {
    const q = OS_BATTLE.questions[0]!;
    expect(simulatedAnswer(q, DEMO_SELF.id, "x")).toEqual(simulatedAnswer(q, DEMO_SELF.id, "x"));
    const differs = DEMO_PLAYERS.some(
      (p) => JSON.stringify(simulatedAnswer(q, p.id, "x")) !== JSON.stringify(simulatedAnswer(q, p.id, "y")),
    );
    expect(differs).toBe(true);
  });
});
