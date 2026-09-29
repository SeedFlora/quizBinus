import { describe, expect, it } from "vitest";
import { GameEngine } from "@/lib/game/engine";
import type { AnswerPayload, Question } from "@/lib/game/types";
import { simulateGame } from "@/lib/demo/simulate";
import { computeSessionAnalytics, difficultyFor, splitOutcomeLabel } from "@/lib/analytics/compute";
import { parseEngineState } from "@/lib/analytics/server-source";
import { question, quiz } from "../../fixtures/quiz";

const T0 = 1_700_000_000_000;

const choose = (q: Question, index: number): AnswerPayload => ({ kind: "choice", answerIds: [q.answers[index]!.id] });

/** Plays each question with the given answers ({ playerId: payload | null }) and finishes. */
function play(
  questions: Question[],
  rounds: Array<Record<string, AnswerPayload | null>>,
  players = ["p1", "p2", "p3", "p4"],
) {
  const engine = GameEngine.create({
    sessionId: "s1",
    roomCode: "123456",
    hostName: "Bu Laras",
    quiz: quiz(questions),
    now: T0,
  });
  players.forEach((id, i) => engine.addPlayer({ id, nickname: `Mhs ${i + 1}`, avatarSeed: id }, T0 + i));
  let now = T0 + 10_000;
  engine.start(now);
  rounds.forEach((answers, qi) => {
    engine.openQuestion((now += 3_000));
    const q = engine.currentQuestion!;
    let offset = 1_000;
    for (const [pid, payload] of Object.entries(answers)) {
      if (payload) engine.submitAnswer(pid, q.id, payload, now + (offset += 1_000));
    }
    engine.closeQuestion((now += q.timeLimit * 1000));
    if (qi < rounds.length - 1) engine.next((now += 5_000));
  });
  engine.finish((now += 5_000));
  return engine;
}

describe("difficulty bands (Arikunto item difficulty index)", () => {
  it("uses > 0.70 mudah, ≤ 0.30 sulit, otherwise sedang", () => {
    expect(difficultyFor(0.71)).toBe("mudah");
    expect(difficultyFor(0.7)).toBe("sedang");
    expect(difficultyFor(0.31)).toBe("sedang");
    expect(difficultyFor(0.3)).toBe("sulit");
    expect(difficultyFor(null)).toBeNull();
  });
});

describe("splitOutcomeLabel", () => {
  it("splits a coded learning outcome", () => {
    expect(splitOutcomeLabel("LO2 — Menganalisis algoritma penjadwalan")).toEqual({
      code: "LO2",
      description: "Menganalisis algoritma penjadwalan",
    });
    expect(splitOutcomeLabel("Sub-CPMK 3.1: Menjelaskan deadlock")).toEqual({
      code: "SUB-CPMK3.1",
      description: "Menjelaskan deadlock",
    });
  });
  it("keeps free text as the description", () => {
    expect(splitOutcomeLabel("Memahami scheduling")).toEqual({ code: null, description: "Memahami scheduling" });
    expect(splitOutcomeLabel(null)).toEqual({ code: null, description: null });
  });
});

describe("computeSessionAnalytics", () => {
  const q1 = question("single", { id: "q1", topic: "FCFS", correct: 1 });
  const q2 = question("single", {
    id: "q2",
    topic: "SJF",
    correct: 0,
    learningOutcome: "LO1 — Menjelaskan scheduling",
    timeLimit: 30,
  });

  const engine = play(
    [q1, q2],
    [
      { p1: choose(q1, 1), p2: choose(q1, 0), p3: choose(q1, 0), p4: null },
      { p1: choose(q2, 0), p2: choose(q2, 0), p3: choose(q2, 2), p4: choose(q2, 0) },
    ],
  );
  const a = computeSessionAnalytics(engine.state);

  it("measures accuracy over answers and reports non-answers separately", () => {
    const [first, second] = a.questions;
    expect(first).toMatchObject({ eligible: 4, answered: 3, correct: 1, noAnswer: 1 });
    expect(first!.accuracy).toBeCloseTo(1 / 3);
    expect(first!.difficulty).toBe("sedang");
    expect(second).toMatchObject({ answered: 4, correct: 3, accuracy: 0.75, difficulty: "mudah" });
    expect(a.overview).toMatchObject({
      participants: 4,
      responses: 7,
      expectedResponses: 8,
      correctResponses: 4,
      gradedResponses: 7,
    });
    expect(a.overview.overallAccuracy).toBeCloseTo(4 / 7);
    expect(a.overview.completionRate).toBeCloseTo(7 / 8);
    expect(a.overview.fullyCompleted).toBe(3);
  });

  it("builds an option distribution with shares of answers and the top misconception", () => {
    const d = a.questions[0]!.distribution;
    expect(d.map((b) => [b.slot, b.count, b.isCorrect])).toEqual([
      [0, 2, false],
      [1, 1, true],
      [2, 0, false],
      [3, 0, false],
    ]);
    expect(d[0]!.share).toBeCloseTo(2 / 3);
    expect(a.questions[0]!.misconception?.key).toBe("q1-a1");
  });

  it("ranks students like the engine leaderboard, with accuracy over questions attended", () => {
    const ranks = a.students.map((s) => s.playerId);
    expect(ranks).toEqual(engine.state.leaderboard.map((e) => e.playerId));
    const p1 = a.students.find((s) => s.playerId === "p1")!;
    expect(p1).toMatchObject({ rank: 1, correct: 2, answered: 2, questions: 2, accuracy: 1 });
    const p4 = a.students.find((s) => s.playerId === "p4")!;
    expect(p4).toMatchObject({ correct: 1, answered: 1, questions: 2, accuracy: 0.5 });
  });

  it("groups learning outcomes by question LO, then course LO, then topic", () => {
    expect(a.learningOutcomes.map((g) => [g.code, g.description, g.questionNumbers])).toEqual([
      [null, "FCFS", [1]],
      ["LO1", "Menjelaskan scheduling", [2]],
    ]);
    expect(a.topics.map((g) => g.label)).toEqual(["FCFS", "SJF"]);
  });

  it("names hardest, easiest, slowest and the biggest misconception", () => {
    expect(a.highlights.hardest).toMatchObject({ number: 1, topic: "FCFS" });
    expect(a.highlights.easiest).toMatchObject({ number: 2, value: 0.75 });
    expect(a.highlights.misconception).toMatchObject({ number: 1, bucket: { key: "q1-a1", count: 2 } });
    expect(a.highlights.slowest?.number).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    expect(computeSessionAnalytics(structuredClone(engine.state))).toEqual(a);
  });
});

describe("edge cases", () => {
  it("excludes kicked players and skipped questions", () => {
    const q1 = question("single", { id: "k1", correct: 1 });
    const q2 = question("single", { id: "k2", correct: 1 });
    const engine = GameEngine.create({
      sessionId: "s2",
      roomCode: "654321",
      hostName: "Pak Budi",
      quiz: quiz([q1, q2]),
      now: T0,
    });
    for (const id of ["a", "b", "c"]) engine.addPlayer({ id, nickname: `Nick ${id}`, avatarSeed: id }, T0);
    engine.start(T0 + 1_000);
    engine.openQuestion(T0 + 2_000);
    engine.submitAnswer("a", "k1", choose(q1, 1), T0 + 3_000);
    engine.submitAnswer("c", "k1", choose(q1, 0), T0 + 3_500);
    engine.kickPlayer("c");
    engine.closeQuestion(T0 + 30_000);
    engine.next(T0 + 31_000);
    engine.skip(T0 + 32_000);

    const a = computeSessionAnalytics(engine.state);
    expect(a.overview.participants).toBe(2);
    expect(a.questions[0]).toMatchObject({ eligible: 2, answered: 1, correct: 1, accuracy: 1 });
    expect(a.questions[1]).toMatchObject({ status: "skipped", accuracy: null, distribution: [] });
    expect(a.overview.skippedQuestions).toBe(1);
    // One question only: "easiest" would repeat "hardest", so it is left out.
    expect(a.highlights.easiest).toBeNull();
  });

  it("groups typed answers by normalized text and keeps polls out of accuracy", () => {
    const sa = question("short_answer", { id: "sa", acceptedAnswers: ["DNS"] });
    const poll = question("poll", { id: "pl" });
    const engine = play(
      [sa, poll],
      [
        {
          p1: { kind: "text", value: "DNS" },
          p2: { kind: "text", value: " dns " },
          p3: { kind: "text", value: "DHCP" },
          p4: null,
        },
        { p1: choose(poll, 0), p2: choose(poll, 0), p3: choose(poll, 2), p4: choose(poll, 1) },
      ],
    );
    const a = computeSessionAnalytics(engine.state);
    const [typed, pollQ] = a.questions;
    expect(typed!.distribution.map((b) => [b.label, b.count, b.isCorrect])).toEqual([
      ["DNS", 2, true],
      ["DHCP", 1, false],
    ]);
    expect(typed!.correctText).toBe("DNS");
    expect(pollQ).toMatchObject({ gradable: false, accuracy: null, misconception: null, answered: 4 });
    expect(a.overview.gradedQuestions).toBe(1);
    expect(a.overview.completionRate).toBeCloseTo(7 / 8);
  });

  it("does not count an open question as played", () => {
    const { engine } = simulateGame({ playedQuestions: 3, stopAt: "question", answeredInOpenQuestion: 10 });
    const a = computeSessionAnalytics(engine.state);
    expect(a.session.status).toBe("in_progress");
    expect(a.overview.playedQuestions).toBe(3);
    expect(a.questions[3]!.status).toBe("unplayed");
  });
});

describe("demo session", () => {
  const { engine } = simulateGame({ playedQuestions: 10, stopAt: "finished" });
  const a = computeSessionAnalytics(engine.state);

  it("summarizes the full simulated class consistently", () => {
    expect(a.overview.participants).toBe(42);
    expect(a.overview.playedQuestions).toBe(10);
    expect(a.overview.correctResponses).toBe(a.students.reduce((s, x) => s + x.correct, 0));
    expect(a.overview.responses).toBe(a.questions.reduce((s, q) => s + q.answered, 0));
    const accuracies = a.questions.map((q) => q.accuracy!);
    expect(a.highlights.hardest!.value).toBe(Math.min(...accuracies));
    expect(a.highlights.easiest!.value).toBe(Math.max(...accuracies));
    // Matches the per-question stats the host saw at each reveal.
    for (const q of a.questions) expect(q.accuracy).toBeCloseTo(engine.state.reveals[q.id]!.stats.accuracy);
  });

  it("survives the trip through a server report (JSON + validation) with identical numbers", () => {
    const parsed = parseEngineState(JSON.parse(JSON.stringify(engine.state)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const b = computeSessionAnalytics(parsed.state);
    expect(b.overview).toEqual(a.overview);
    expect(b.questions).toEqual(a.questions);
    expect(b.students).toEqual(a.students);
  });

  it("rejects a report whose quiz snapshot or answers are malformed instead of guessing", () => {
    const state = JSON.parse(JSON.stringify(engine.state)) as Record<string, unknown>;
    expect(parseEngineState({ ...state, quiz: { nope: true } }).ok).toBe(false);
    expect(parseEngineState({ ...state, answers: { q1: { p1: { payload: { kind: "guess" } } } } }).ok).toBe(false);
    expect(parseEngineState(null).ok).toBe(false);
  });
});
