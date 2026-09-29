import { describe, expect, it } from "vitest";
import {
  correctAnswerIds,
  correctAnswerText,
  evaluateAnswer,
  isScored,
  normalizeText,
  toPublicQuestion,
  validatePayload,
} from "@/lib/game/evaluate";
import { QUESTION_TYPES, type AnswerPayload, type Question } from "@/lib/game/types";
import { OS_BATTLE } from "@/lib/seed/quizzes";
import { deepKeys, options, question } from "../../fixtures/quiz";

const choice = (...answerIds: string[]): AnswerPayload => ({ kind: "choice", answerIds });
const text = (value: string): AnswerPayload => ({ kind: "text", value });
const num = (value: number): AnswerPayload => ({ kind: "number", value });
const order = (...answerIds: string[]): AnswerPayload => ({ kind: "order", answerIds });

describe("normalizeText", () => {
  it("ignores case, accents, punctuation and extra whitespace", () => {
    expect(normalizeText("  Round-Robin!! ")).toBe("round robin");
    expect(normalizeText("CAFÉ  crème")).toBe("cafe creme");
    expect(normalizeText("Sémaphore,\tbinary")).toBe("semaphore binary");
  });

  it("keeps letters and digits from any script", () => {
    expect(normalizeText("Wirā 2026")).toBe("wira 2026");
    expect(normalizeText("東京")).toBe("東京");
  });
});

describe("evaluateAnswer", () => {
  describe("single choice", () => {
    const q = question("single", { correct: 1 });
    const [a1, a2] = q.answers;

    it("is correct only for the right option", () => {
      expect(evaluateAnswer(q, choice(a2!.id))).toEqual({ isCorrect: true, credit: 1, scored: true });
      expect(evaluateAnswer(q, choice(a1!.id))).toEqual({ isCorrect: false, credit: 0, scored: true });
    });

    it("rejects multiple picks, unknown ids and the wrong payload kind", () => {
      expect(evaluateAnswer(q, choice(a2!.id, a1!.id)).isCorrect).toBe(false);
      expect(evaluateAnswer(q, choice("nope")).isCorrect).toBe(false);
      expect(evaluateAnswer(q, text("Round Robin")).isCorrect).toBe(false);
    });
  });

  describe("true/false", () => {
    const q = question("true_false", { correct: 1 });
    it("works like single choice", () => {
      expect(evaluateAnswer(q, choice(q.answers[1]!.id)).isCorrect).toBe(true);
      expect(evaluateAnswer(q, choice(q.answers[0]!.id)).isCorrect).toBe(false);
    });
  });

  describe("multiple select (partial credit)", () => {
    // correct: a1, a2, a4 ; wrong: a3
    const q = question("multiple", { correct: [0, 1, 3] });
    const [a1, a2, a3, a4] = q.answers.map((a) => a.id) as [string, string, string, string];

    it("full credit and correct only for the exact set, in any order", () => {
      expect(evaluateAnswer(q, choice(a4, a1, a2))).toEqual({ isCorrect: true, credit: 1, scored: true });
    });

    it("gives proportional credit for a correct subset", () => {
      const r = evaluateAnswer(q, choice(a1, a2));
      expect(r.isCorrect).toBe(false);
      expect(r.credit).toBeCloseTo(2 / 3);
    });

    it("subtracts wrong picks from hits", () => {
      expect(evaluateAnswer(q, choice(a1, a2, a3)).credit).toBeCloseTo(1 / 3);
      expect(evaluateAnswer(q, choice(a1, a2, a3, a4))).toMatchObject({ isCorrect: false });
      expect(evaluateAnswer(q, choice(a1, a2, a3, a4)).credit).toBeCloseTo(2 / 3);
    });

    it("never goes below zero", () => {
      expect(evaluateAnswer(q, choice(a3)).credit).toBe(0);
    });

    it("misses when the question has no correct options or the payload is not a choice", () => {
      const broken = question("multiple", { correct: [] });
      expect(evaluateAnswer(broken, choice(broken.answers[0]!.id))).toMatchObject({ isCorrect: false, credit: 0 });
      expect(evaluateAnswer(q, order(a1, a2, a4)).credit).toBe(0);
    });
  });

  describe("short answer", () => {
    const q = question("short_answer", { acceptedAnswers: ["Round Robin", "RR", "Péterson"] });

    it.each([["round robin"], ["  ROUND   ROBIN  "], ["Round-Robin!"], ["rr"], ["peterson"], ["PETERSON."]])(
      "accepts %j",
      (value) => {
        expect(evaluateAnswer(q, text(value))).toEqual({ isCorrect: true, credit: 1, scored: true });
      },
    );

    it.each([["robin"], ["round robin scheduling"], [""], ["   "], ["!!!"]])("rejects %j", (value) => {
      expect(evaluateAnswer(q, text(value)).isCorrect).toBe(false);
    });

    it("rejects non-text payloads and questions without accepted answers", () => {
      expect(evaluateAnswer(q, num(1)).isCorrect).toBe(false);
      const none = question("short_answer", { acceptedAnswers: undefined });
      expect(evaluateAnswer(none, text("anything")).isCorrect).toBe(false);
    });
  });

  describe("numeric", () => {
    const q = question("numeric", { numeric: { value: 42, tolerance: 0.5, unit: "ms" } });

    it("accepts values within the tolerance (inclusive)", () => {
      expect(evaluateAnswer(q, num(42)).isCorrect).toBe(true);
      expect(evaluateAnswer(q, num(42.5)).isCorrect).toBe(true);
      expect(evaluateAnswer(q, num(41.5)).isCorrect).toBe(true);
    });

    it("rejects values outside the tolerance and non-finite numbers", () => {
      expect(evaluateAnswer(q, num(42.51)).isCorrect).toBe(false);
      expect(evaluateAnswer(q, num(41.49)).isCorrect).toBe(false);
      expect(evaluateAnswer(q, num(Number.NaN)).isCorrect).toBe(false);
      expect(evaluateAnswer(q, num(Number.POSITIVE_INFINITY)).isCorrect).toBe(false);
    });

    it("treats a negative tolerance as its absolute value", () => {
      const neg = question("numeric", { numeric: { value: 10, tolerance: -1 } });
      expect(evaluateAnswer(neg, num(10.9)).isCorrect).toBe(true);
      expect(evaluateAnswer(neg, num(11.1)).isCorrect).toBe(false);
    });

    it("misses without a numeric spec or with a text payload", () => {
      expect(evaluateAnswer(question("numeric", { numeric: undefined }), num(42)).isCorrect).toBe(false);
      expect(evaluateAnswer(q, text("42")).isCorrect).toBe(false);
    });
  });

  describe("ordering", () => {
    // Authored out of array order: the solution follows `position`, not array index.
    const q = question("ordering", {
      id: "ord",
      answers: [
        { id: "c", position: 2, text: "Running", isCorrect: false },
        { id: "a", position: 0, text: "New", isCorrect: false },
        { id: "d", position: 3, text: "Terminated", isCorrect: false },
        { id: "b", position: 1, text: "Ready", isCorrect: false },
      ],
    });

    it("is correct only for the exact authored sequence", () => {
      expect(evaluateAnswer(q, order("a", "b", "c", "d"))).toEqual({ isCorrect: true, credit: 1, scored: true });
      expect(evaluateAnswer(q, order("b", "a", "c", "d")).isCorrect).toBe(false);
      expect(evaluateAnswer(q, order("a", "b", "c")).isCorrect).toBe(false);
      expect(evaluateAnswer(q, choice("a", "b", "c", "d")).isCorrect).toBe(false);
    });
  });

  describe("poll", () => {
    it("is never correct and never scored", () => {
      const q = question("poll");
      expect(evaluateAnswer(q, choice(q.answers[0]!.id))).toEqual({ isCorrect: false, credit: 0, scored: false });
    });
  });
});

describe("isScored", () => {
  it("excludes polls and zero-point questions", () => {
    expect(isScored(question("single"))).toBe(true);
    expect(isScored(question("single", { points: 0 }))).toBe(false);
    expect(isScored(question("poll", { points: 1000 }))).toBe(false);
  });
});

describe("validatePayload", () => {
  const single = question("single");
  const multi = question("multiple");
  const poll = question("poll");
  const ordering = question("ordering");
  const ids = (q: Question) => q.answers.map((a) => a.id);

  it("single / true_false / poll need exactly one known choice", () => {
    expect(validatePayload(single, choice(ids(single)[0]!))).toBeNull();
    expect(validatePayload(single, text("x"))).toBe("expected_choice");
    expect(validatePayload(single, choice())).toBe("expected_one_choice");
    expect(validatePayload(single, choice(...ids(single).slice(0, 2)))).toBe("expected_one_choice");
    expect(validatePayload(single, choice("ghost"))).toBe("unknown_answer");
    expect(validatePayload(poll, choice(ids(poll)[2]!))).toBeNull();
    expect(validatePayload(question("true_false"), num(1))).toBe("expected_choice");
  });

  it("multiple needs a non-empty set of distinct known choices", () => {
    expect(validatePayload(multi, choice(...ids(multi)))).toBeNull();
    expect(validatePayload(multi, order(...ids(multi)))).toBe("expected_choice");
    expect(validatePayload(multi, choice())).toBe("empty_choice");
    expect(validatePayload(multi, choice(ids(multi)[0]!, ids(multi)[0]!))).toBe("duplicate_choice");
    expect(validatePayload(multi, choice(ids(multi)[0]!, "ghost"))).toBe("unknown_answer");
  });

  it("short answer needs 1..120 characters of non-blank text", () => {
    const q = question("short_answer");
    expect(validatePayload(q, text("RR"))).toBeNull();
    expect(validatePayload(q, num(1))).toBe("expected_text");
    expect(validatePayload(q, text("   "))).toBe("invalid_text");
    expect(validatePayload(q, text("x".repeat(120)))).toBeNull();
    expect(validatePayload(q, text("x".repeat(121)))).toBe("invalid_text");
  });

  it("numeric needs a finite number", () => {
    const q = question("numeric");
    expect(validatePayload(q, num(-3.5))).toBeNull();
    expect(validatePayload(q, text("3"))).toBe("expected_number");
    expect(validatePayload(q, num(Number.NaN))).toBe("invalid_number");
    expect(validatePayload(q, num(Number.NEGATIVE_INFINITY))).toBe("invalid_number");
  });

  it("ordering needs every option exactly once", () => {
    const all = ids(ordering);
    expect(validatePayload(ordering, order(...[...all].reverse()))).toBeNull();
    expect(validatePayload(ordering, choice(...all))).toBe("expected_order");
    expect(validatePayload(ordering, order(...all.slice(1)))).toBe("incomplete_order");
    expect(validatePayload(ordering, order(all[0]!, all[0]!, all[1]!, all[2]!))).toBe("duplicate_order");
    expect(validatePayload(ordering, order(all[0]!, all[1]!, all[2]!, "ghost"))).toBe("unknown_answer");
  });
});

describe("toPublicQuestion", () => {
  const FORBIDDEN_KEYS = [
    "isCorrect",
    "acceptedAnswers",
    "numeric",
    "explanation",
    "correctAnswerIds",
    "learningOutcome",
  ];

  it.each(QUESTION_TYPES.map((t) => [t]))("never leaks correctness data for %s questions", (type) => {
    const q = question(type, {
      explanation: "Karena FCFS melayani sesuai urutan kedatangan.",
      learningOutcome: "LO2",
    });
    const pub = toPublicQuestion(q, 2, 10, "session-1");
    const keys = deepKeys(pub);
    for (const k of FORBIDDEN_KEYS) expect(keys.has(k), `leaked "${k}"`).toBe(false);
    for (const a of pub.answers) expect(Object.keys(a).sort()).toEqual(["id", "position", "text"]);

    const json = JSON.stringify(pub);
    expect(json).not.toContain("Karena FCFS");
    if (type === "short_answer") expect(json).not.toMatch(/Round Robin|"RR"/);
    if (type === "numeric") expect(json).not.toContain("42");
    expect(pub).toMatchObject({ id: q.id, index: 2, total: 10, type, prompt: q.prompt, timeLimit: 20, points: 1000 });
  });

  it("never leaks correctness for any seeded quiz question", () => {
    OS_BATTLE.questions.forEach((q, i) => {
      const pub = toPublicQuestion(q, i, OS_BATTLE.questions.length, "demo");
      expect(deepKeys(pub).has("isCorrect")).toBe(false);
      expect(pub.answers.map((a) => a.id).sort()).toEqual(q.answers.map((a) => a.id).sort());
    });
  });

  it("orders non-ordering answers by position and keeps a numeric unit hint", () => {
    const q = question("single", {
      answers: [
        { id: "x2", position: 1, text: "B", isCorrect: true },
        { id: "x1", position: 0, text: "A", isCorrect: false },
      ],
    });
    expect(toPublicQuestion(q, 0, 1, "s").answers.map((a) => a.id)).toEqual(["x1", "x2"]);
    expect(toPublicQuestion(question("numeric"), 0, 1, "s").unit).toBe("ms");
  });

  it("gives multiple-select a selectCount hint without saying which", () => {
    const q = question("multiple", { correct: [0, 2] });
    const pub = toPublicQuestion(q, 0, 1, "s");
    expect(pub.selectCount).toBe(2);
    expect(toPublicQuestion(question("single"), 0, 1, "s").selectCount).toBeUndefined();
  });

  describe("ordering shuffle", () => {
    const solutionOf = (q: Question) => correctAnswerIds(q);

    it("is deterministic per session + question", () => {
      const q = question("ordering", { id: "ord-det" });
      const a = toPublicQuestion(q, 0, 1, "session-A").answers.map((x) => x.id);
      const b = toPublicQuestion(q, 0, 1, "session-A").answers.map((x) => x.id);
      expect(a).toEqual(b);
    });

    it("differs across sessions (not a fixed permutation)", () => {
      const q = question("ordering", { id: "ord-var", texts: ["1", "2", "3", "4", "5"] });
      const seen = new Set<string>();
      for (let i = 0; i < 30; i++)
        seen.add(
          toPublicQuestion(q, 0, 1, `s-${i}`)
            .answers.map((x) => x.id)
            .join(),
        );
      expect(seen.size).toBeGreaterThan(3);
    });

    it("never presents the solution, for any seed and any length", () => {
      for (const n of [2, 3, 4, 6]) {
        const q = question("ordering", { id: `ord-${n}`, texts: Array.from({ length: n }, (_, i) => `step ${i}`) });
        for (let i = 0; i < 200; i++) {
          const shown = toPublicQuestion(q, 0, 1, `seed-${i}`).answers.map((x) => x.id);
          expect(shown).not.toEqual(solutionOf(q));
          expect([...shown].sort()).toEqual([...solutionOf(q)].sort());
        }
      }
    });

    it("never presents the solution when authored positions are not 0-based", () => {
      const q = question("ordering", {
        id: "ord-1based",
        answers: [
          { id: "p1", position: 1, text: "New", isCorrect: false },
          { id: "p2", position: 2, text: "Ready", isCorrect: false },
          { id: "p3", position: 3, text: "Running", isCorrect: false },
        ],
      });
      for (let i = 0; i < 200; i++) {
        expect(toPublicQuestion(q, 0, 1, `seed-${i}`).answers.map((x) => x.id)).not.toEqual(["p1", "p2", "p3"]);
      }
    });

    it("re-indexes positions so they reveal nothing about the solution", () => {
      const q = question("ordering", { id: "ord-pos" });
      const pub = toPublicQuestion(q, 0, 1, "session-A");
      expect(pub.answers.map((a) => a.position)).toEqual([0, 1, 2, 3]);
    });

    it("is also what the engine shows for the seeded ordering question", () => {
      const seeded = OS_BATTLE.questions.find((q) => q.type === "ordering");
      if (!seeded) return;
      const shown = toPublicQuestion(seeded, 0, 1, "demo").answers.map((a) => a.id);
      expect(shown).not.toEqual(solutionOf(seeded));
    });
  });
});

describe("correctAnswerIds / correctAnswerText", () => {
  it("lists correct option ids, or the ordering sequence by position", () => {
    const q = question("multiple", { id: "m", correct: [1, 2] });
    expect(correctAnswerIds(q)).toEqual(["m-a2", "m-a3"]);
    const ord = question("ordering", {
      answers: [
        { id: "z", position: 1, text: "Second", isCorrect: false },
        { id: "y", position: 0, text: "First", isCorrect: false },
      ],
    });
    expect(correctAnswerIds(ord)).toEqual(["y", "z"]);
    expect(correctAnswerText(ord)).toBe("First → Second");
  });

  it("describes short answers and numeric answers for the reveal", () => {
    expect(correctAnswerText(question("short_answer"))).toBe("Round Robin");
    expect(correctAnswerText(question("numeric"))).toBe("42 ms");
    expect(correctAnswerText(question("numeric", { numeric: { value: 3, tolerance: 0 } }))).toBe("3");
    expect(correctAnswerText(question("single"))).toBeUndefined();
  });

  it("options helper sanity: ids are stable", () => {
    expect(options("q", ["a", "b"], 1).map((o) => [o.id, o.isCorrect])).toEqual([
      ["q-a1", false],
      ["q-a2", true],
    ]);
  });
});
