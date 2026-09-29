/**
 * Small, explicit quiz builders for tests. Seed content (lib/seed) is used where a
 * realistic quiz matters; these helpers keep engine/evaluate tests readable.
 */

import type { AnswerOption, GameMode, Question, QuestionType, Quiz } from "@/lib/game/types";

export function options(questionId: string, texts: string[], correct: number | number[] = []): AnswerOption[] {
  const correctSet = new Set(Array.isArray(correct) ? correct : [correct]);
  return texts.map((text, i) => ({ id: `${questionId}-a${i + 1}`, position: i, text, isCorrect: correctSet.has(i) }));
}

let counter = 0;

export function question(
  type: QuestionType,
  overrides: Partial<Omit<Question, "type">> & { correct?: number | number[]; texts?: string[] } = {},
): Question {
  const { correct, texts, ...rest } = overrides;
  const id = rest.id ?? `q${++counter}`;
  const defaults: Record<QuestionType, () => Partial<Question>> = {
    single: () => ({ answers: options(id, texts ?? ["FCFS", "Round Robin", "SJF", "Priority"], correct ?? 1) }),
    true_false: () => ({ answers: options(id, texts ?? ["Benar", "Salah"], correct ?? 0) }),
    multiple: () => ({
      answers: options(id, texts ?? ["Mutex", "Semaphore", "Busy loop", "Monitor"], correct ?? [0, 1, 3]),
    }),
    poll: () => ({ answers: options(id, texts ?? ["Mudah", "Pas", "Sulit"]) }),
    ordering: () => ({ answers: options(id, texts ?? ["New", "Ready", "Running", "Terminated"]) }),
    short_answer: () => ({ answers: [], acceptedAnswers: ["Round Robin", "RR"] }),
    numeric: () => ({ answers: [], numeric: { value: 42, tolerance: 0.5, unit: "ms" } }),
  };
  const base = defaults[type]();
  return {
    id,
    position: 0,
    type,
    prompt: `Soal ${type}`,
    timeLimit: 20,
    points: 1000,
    topic: "Umum",
    ...base,
    ...rest,
    answers: rest.answers ?? base.answers ?? [],
  };
}

export function quiz(questions: Question[], mode: GameMode = "classic"): Quiz {
  return {
    id: "quiz-test",
    ownerId: "owner-test",
    title: "Kuis Uji",
    course: { courseCode: "COMP6716", courseName: "Operating Systems" },
    difficulty: "sedang",
    language: "id",
    visibility: "private",
    mode,
    questions: questions.map((q, i) => ({ ...q, position: i })),
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

/** Recursively collects every object key in a JSON-able value. */
export function deepKeys(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => deepKeys(v, into));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      into.add(k);
      deepKeys(v, into);
    }
  }
  return into;
}
