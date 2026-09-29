import { describe, expect, it } from "vitest";
import { QUESTION_TYPES } from "@/lib/game/types";
import {
  changeQuestionType,
  DEFAULT_POINTS,
  duplicateQuestion,
  moveItem,
  newQuestion,
  newQuiz,
  TRUE_FALSE_LABELS,
} from "@/lib/quiz/factory";
import { parseQuiz, validateQuestion } from "@/lib/quiz/schema";
import { question } from "../../fixtures/quiz";

describe("newQuestion / newQuiz", () => {
  it.each(QUESTION_TYPES)("builds a structurally valid %s draft", (type) => {
    const quiz = newQuiz({ ownerId: "u1", questions: [newQuestion(type)] });
    expect(parseQuiz(quiz).ok).toBe(true);
  });

  it("uses the quiz language for true/false labels", () => {
    expect(newQuestion("true_false", { language: "en" }).answers.map((a) => a.text)).toEqual([...TRUE_FALSE_LABELS.en]);
    expect(newQuestion("true_false").answers.map((a) => a.text)).toEqual(["Benar", "Salah"]);
  });

  it("polls never score; typed questions start without choices", () => {
    expect(newQuestion("poll", { points: 2000 }).points).toBe(0);
    expect(newQuestion("short_answer")).toMatchObject({ answers: [], acceptedAnswers: [""] });
    expect(newQuestion("numeric").answers).toEqual([]);
  });

  it("a new quiz is private, classic and opens on one blank question", () => {
    const quiz = newQuiz({ ownerId: "u1", course: { lecturer: "Bu Laras" } });
    expect(quiz).toMatchObject({ visibility: "private", mode: "classic", difficulty: "sedang", title: "" });
    expect(quiz.course.lecturer).toBe("Bu Laras");
    expect(quiz.questions).toHaveLength(1);
    expect(quiz.questions[0]!.type).toBe("single");
  });
});

describe("duplicateQuestion", () => {
  it("copies content with fresh ids and no shared references", () => {
    const original = question("short_answer", { acceptedAnswers: ["DNS"] });
    const copy = duplicateQuestion(original);
    expect(copy.id).not.toBe(original.id);
    expect(copy.prompt).toBe(original.prompt);
    copy.acceptedAnswers!.push("Domain Name System");
    expect(original.acceptedAnswers).toEqual(["DNS"]);

    const choice = question("single");
    const choiceCopy = duplicateQuestion(choice);
    expect(choiceCopy.answers.map((a) => a.text)).toEqual(choice.answers.map((a) => a.text));
    for (const [i, a] of choiceCopy.answers.entries()) expect(a.id).not.toBe(choice.answers[i]!.id);
  });
});

describe("changeQuestionType", () => {
  const base = () =>
    question("single", {
      texts: ["FCFS", "Round Robin", "SJF", "Priority"],
      correct: 1,
      explanation: "RR memakai time quantum.",
      mediaUrl: "https://example.com/a.webp",
      learningOutcome: "LO2",
    });

  it("always keeps the prompt, media, explanation, timing and learning outcome", () => {
    const from = base();
    for (const type of QUESTION_TYPES) {
      const to = changeQuestionType(from, type);
      expect(to).toMatchObject({
        id: from.id,
        type,
        prompt: from.prompt,
        mediaUrl: from.mediaUrl,
        explanation: from.explanation,
        timeLimit: from.timeLimit,
        learningOutcome: "LO2",
      });
    }
  });

  it("single → short answer carries the correct choice over as the accepted answer", () => {
    expect(changeQuestionType(base(), "short_answer").acceptedAnswers).toEqual(["Round Robin"]);
  });

  it("short answer → single brings back the remembered choices", () => {
    const from = base();
    const short = changeQuestionType(from, "short_answer");
    const back = changeQuestionType(short, "single", { rememberedAnswers: from.answers });
    expect(back.answers.map((a) => a.text)).toEqual(["FCFS", "Round Robin", "SJF", "Priority"]);
    expect(back.answers.filter((a) => a.isCorrect).map((a) => a.text)).toEqual(["Round Robin"]);
    expect(validateQuestion(back)).toEqual([]);
  });

  it("short answer → choice without memory: the first accepted spelling becomes the correct choice", () => {
    const short = question("short_answer", { acceptedAnswers: ["DNS", "Domain Name System"] });
    for (const type of ["single", "multiple"] as const) {
      // Synonyms are not turned into distractors: the second row is left for the lecturer.
      expect(changeQuestionType(short, type).answers.map((a) => [a.text, a.isCorrect])).toEqual([
        ["DNS", true],
        ["", false],
      ]);
    }
  });

  it("choice ⇄ numeric parses Indonesian decimals and keeps unit/tolerance", () => {
    const choice = question("single", { texts: ["3,5", "4"], correct: 0 });
    const numeric = changeQuestionType(choice, "numeric");
    expect(numeric.numeric).toEqual({ value: 3.5, tolerance: 0, unit: undefined });
    const withUnit = { ...numeric, numeric: { value: 3.5, tolerance: 0.5, unit: "ms" } };
    const back = changeQuestionType(withUnit, "short_answer");
    expect(back.acceptedAnswers).toEqual(["3.5"]);
  });

  it("poll clears correctness and points; leaving a poll restores the standard points", () => {
    const poll = changeQuestionType(base(), "poll");
    expect(poll.points).toBe(0);
    expect(poll.answers.every((a) => !a.isCorrect)).toBe(true);
    expect(changeQuestionType(poll, "single").points).toBe(DEFAULT_POINTS);
    // …but a deliberate custom value survives unrelated type changes
    expect(changeQuestionType({ ...base(), points: 1500 }, "multiple").points).toBe(1500);
  });

  it("multiple → single keeps only the first correct answer", () => {
    const multiple = question("multiple", { correct: [0, 2] });
    const single = changeQuestionType(multiple, "single");
    expect(single.answers.map((a) => a.isCorrect)).toEqual([true, false, false, false]);
  });

  it("ordering → multiple does not invent correct answers", () => {
    const multiple = changeQuestionType(question("ordering"), "multiple");
    expect(multiple.answers.some((a) => a.isCorrect)).toBe(false);
  });

  it("→ true/false keeps the verdict of a two-way choice, in the quiz language", () => {
    const twoWay = question("single", { texts: ["Ya", "Tidak"], correct: 1 });
    const tf = changeQuestionType(twoWay, "true_false", { language: "en" });
    expect(tf.answers.map((a) => [a.text, a.isCorrect])).toEqual([
      ["True", false],
      ["False", true],
    ]);
  });

  it("choice lists are trimmed to the target type's limit and padded to two rows", () => {
    const ordering = question("ordering", { texts: ["1", "2", "3", "4", "5", "6"] });
    expect(changeQuestionType(ordering, "single").answers).toHaveLength(4);
    const numeric = question("numeric", { numeric: undefined });
    expect(changeQuestionType(numeric, "single").answers).toHaveLength(2);
  });
});

describe("moveItem", () => {
  const items = [
    { position: 0, id: "a" },
    { position: 1, id: "b" },
    { position: 2, id: "c" },
  ];

  it("swaps with the neighbour and reindexes positions", () => {
    expect(moveItem(items, 2, -1).map((i) => [i.id, i.position])).toEqual([
      ["a", 0],
      ["c", 1],
      ["b", 2],
    ]);
  });

  it("is a no-op at the edges", () => {
    expect(moveItem(items, 0, -1).map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(moveItem(items, 2, 1).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
});
