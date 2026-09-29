import { describe, expect, it } from "vitest";
import type { Question } from "@/lib/game/types";
import { newQuestion, newQuiz } from "@/lib/quiz/factory";
import { LIMITS, parseQuiz, validateQuestion, validateQuiz, type QuestionIssueCode } from "@/lib/quiz/schema";
import { SEED_QUIZZES } from "@/lib/seed/quizzes";
import { question } from "../../fixtures/quiz";

const codes = (q: Question): QuestionIssueCode[] => validateQuestion(q).map((i) => i.code);

describe("parseQuiz (structure)", () => {
  it.each(SEED_QUIZZES.map((q) => [q.id, q] as const))("accepts the seed quiz %s", (_id, quiz) => {
    const parsed = parseQuiz(quiz);
    expect(parsed.ok, parsed.ok ? "" : parsed.error).toBe(true);
  });

  it("accepts a blank draft: an empty prompt is still a valid draft", () => {
    expect(parseQuiz(newQuiz({ ownerId: "u1" })).ok).toBe(true);
  });

  it("accepts uploaded, http(s) and resized data URLs as media, and nothing else", () => {
    const quiz = newQuiz({ ownerId: "u1" });
    const withMedia = (mediaUrl: string) => ({ ...quiz, questions: [{ ...quiz.questions[0]!, mediaUrl }] });
    expect(parseQuiz(withMedia("/api/media/3f2a9c0e8b7d4e1f.webp")).ok).toBe(true);
    expect(parseQuiz(withMedia("https://cdn.binus.ac.id/quiz/a.webp")).ok).toBe(true);
    expect(parseQuiz(withMedia("data:image/webp;base64,AAAA")).ok).toBe(true);
    expect(parseQuiz(withMedia("javascript:alert(1)")).ok).toBe(false);
    expect(parseQuiz(withMedia("data:text/html;base64,AAAA")).ok).toBe(false);
    // Only files in the media folder: no traversal, no other same-origin paths.
    expect(parseQuiz(withMedia("/api/media/../sessions")).ok).toBe(false);
    expect(parseQuiz(withMedia("/api/media/..")).ok).toBe(false);
    expect(parseQuiz(withMedia("/api/sessions/x/report")).ok).toBe(false);
  });

  it("rejects out-of-range timing and points, and reports why", () => {
    const quiz = newQuiz({ ownerId: "u1" });
    const bad = { ...quiz, questions: [{ ...quiz.questions[0]!, timeLimit: 999, points: -5 }] };
    const parsed = parseQuiz(bad);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/timeLimit/);
  });
});

describe("validateQuestion (readiness)", () => {
  it("every seed quiz is ready to play", () => {
    for (const quiz of SEED_QUIZZES) expect(validateQuiz(quiz), quiz.id).toMatchObject({ ready: true, count: 0 });
  });

  it("requires a prompt", () => {
    expect(codes(question("single", { prompt: "   " }))).toEqual(["promptRequired"]);
  });

  it("single / true_false need exactly one correct answer", () => {
    expect(codes(question("single", { correct: [] }))).toEqual(["needCorrect"]);
    expect(codes(question("single", { correct: [0, 1] }))).toEqual(["singleOneCorrect"]);
    expect(codes(question("true_false", { correct: [] }))).toEqual(["needCorrect"]);
  });

  it("multiple needs at least one correct answer; poll and ordering need none", () => {
    expect(codes(question("multiple", { correct: [] }))).toEqual(["needCorrect"]);
    expect(codes(question("poll"))).toEqual([]);
    expect(codes(question("ordering"))).toEqual([]);
  });

  it("points at the exact answer row for empty and duplicate choices", () => {
    const empty = question("single", { texts: ["FCFS", " ", "SJF"], correct: 0 });
    expect(validateQuestion(empty)).toContainEqual({
      code: "answerEmpty",
      field: "answers",
      answerId: empty.answers[1]!.id,
    });

    const dup = question("single", { texts: ["FCFS", "fcfs ", "SJF"], correct: 0 });
    expect(validateQuestion(dup)).toContainEqual({
      code: "answerDuplicate",
      field: "answers",
      answerId: dup.answers[1]!.id,
    });
  });

  it("enforces answer counts per type", () => {
    expect(codes(question("single", { texts: ["Only one"], correct: 0 }))).toContain("needTwoAnswers");
    expect(codes(question("true_false", { texts: ["Benar", "Salah", "Mungkin"], correct: 0 }))).toContain(
      "tooManyAnswers",
    );
    expect(codes(question("single", { texts: ["A", "B", "C", "D", "E"], correct: 0 }))).toContain("tooManyAnswers");
    expect(codes(question("ordering", { texts: ["1", "2", "3", "4", "5", "6"] }))).toEqual([]);
  });

  it("short answer needs one non-blank accepted answer", () => {
    expect(codes(question("short_answer", { acceptedAnswers: ["", "  "] }))).toEqual(["needAccepted"]);
    expect(codes(question("short_answer", { acceptedAnswers: ["DNS"] }))).toEqual([]);
  });

  it("numeric needs a finite value and a non-negative tolerance", () => {
    expect(codes(question("numeric", { numeric: undefined }))).toEqual(["numericValue"]);
    expect(codes(question("numeric", { numeric: { value: 3, tolerance: -1 } }))).toEqual(["numericValue"]);
    expect(codes(question("numeric", { numeric: { value: 3.5, tolerance: 0 } }))).toEqual([]);
  });

  it("checks timing and points ranges", () => {
    expect(codes(question("single", { timeLimit: LIMITS.timeMin - 1 }))).toEqual(["timeLimit"]);
    expect(codes(question("single", { points: 12.5 }))).toEqual(["points"]);
    expect(codes(question("single", { points: LIMITS.pointsMax + 1 }))).toEqual(["points"]);
  });
});

describe("validateQuiz", () => {
  it("counts quiz and question issues and names the first question to fix", () => {
    const ok = question("single");
    const broken = question("single", { prompt: "", correct: [] });
    const quiz = newQuiz({ ownerId: "u1", title: " ", questions: [ok, broken] });
    const result = validateQuiz(quiz);
    expect(result.quizIssues).toEqual(["titleRequired"]);
    expect(result.count).toBe(3);
    expect(result.ready).toBe(false);
    expect(result.firstInvalidQuestionId).toBe(broken.id);
    expect(result.questions[ok.id]).toEqual([]);
  });

  it("flags a quiz without questions", () => {
    const result = validateQuiz(newQuiz({ ownerId: "u1", title: "Kosong", questions: [] }));
    expect(result.quizIssues).toEqual(["noQuestions"]);
    expect(result.firstInvalidQuestionId).toBeNull();
  });

  it("a fresh blank quiz is not playable until the lecturer fills it in", () => {
    const result = validateQuiz(newQuiz({ ownerId: "u1", questions: [newQuestion("single")] }));
    expect(result.ready).toBe(false);
    expect(result.quizIssues).toContain("titleRequired");
  });
});
