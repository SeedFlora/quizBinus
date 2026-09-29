/**
 * Pure constructors and transforms for authoring. No I/O, no React: the editor,
 * the AI mock and tests all build quizzes through these functions so defaults
 * stay in one place.
 */

import type { AnswerOption, CourseInfo, Question, QuestionType, Quiz } from "@/lib/game/types";
import { LIMITS, maxAnswers, usesAnswerList } from "./schema";

export const DEFAULT_TIME_LIMIT = 20;
export const DEFAULT_POINTS = 1000;

/** True/False answer texts are quiz content, so they follow the quiz language. */
export const TRUE_FALSE_LABELS: Record<Quiz["language"], readonly [string, string]> = {
  id: ["Benar", "Salah"],
  en: ["True", "False"],
};

const DEFAULT_ANSWER_COUNT: Record<QuestionType, number> = {
  single: 4,
  multiple: 4,
  true_false: 2,
  poll: 4,
  ordering: 4,
  short_answer: 0,
  numeric: 0,
};

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function newAnswer(position: number, text = "", isCorrect = false): AnswerOption {
  return { id: newId(), position, text, isCorrect };
}

/** Rewrites `position` so it always matches array order. */
export function reindex<T extends { position: number }>(items: readonly T[]): T[] {
  return items.map((item, position) => (item.position === position ? item : { ...item, position }));
}

export interface NewQuestionOptions {
  position?: number;
  language?: Quiz["language"];
  timeLimit?: number;
  points?: number;
}

export function newQuestion(type: QuestionType, options: NewQuestionOptions = {}): Question {
  const { position = 0, language = "id", timeLimit = DEFAULT_TIME_LIMIT } = options;
  const points = type === "poll" ? 0 : (options.points ?? DEFAULT_POINTS);
  const answers =
    type === "true_false"
      ? TRUE_FALSE_LABELS[language].map((text, i) => newAnswer(i, text))
      : Array.from({ length: DEFAULT_ANSWER_COUNT[type] }, (_, i) => newAnswer(i));
  return {
    id: newId(),
    position,
    type,
    prompt: "",
    timeLimit,
    points,
    answers,
    ...(type === "short_answer" ? { acceptedAnswers: [""] } : {}),
  };
}

export interface NewQuizOptions {
  ownerId: string;
  title?: string;
  description?: string;
  course?: Partial<CourseInfo>;
  topic?: string;
  difficulty?: Quiz["difficulty"];
  language?: Quiz["language"];
  /** Defaults to one blank single-choice question so the editor never opens empty. */
  questions?: Question[];
  now?: Date;
}

export function newQuiz(options: NewQuizOptions): Quiz {
  const now = (options.now ?? new Date()).toISOString();
  const language = options.language ?? "id";
  return {
    id: newId(),
    ownerId: options.ownerId,
    title: options.title ?? "",
    description: options.description,
    course: {
      courseCode: options.course?.courseCode ?? "",
      courseName: options.course?.courseName ?? "",
      className: options.course?.className,
      lecturer: options.course?.lecturer,
      learningOutcome: options.course?.learningOutcome,
    },
    topic: options.topic,
    difficulty: options.difficulty ?? "sedang",
    language,
    visibility: "private",
    mode: "classic",
    questions: reindex(options.questions ?? [newQuestion("single", { language })]),
    createdAt: now,
    updatedAt: now,
  };
}

/** Deep copy with fresh ids (question and answers), placed right after the original. */
export function duplicateQuestion(question: Question): Question {
  return {
    ...question,
    id: newId(),
    position: question.position + 1,
    answers: question.answers.map((a) => ({ ...a, id: newId() })),
    acceptedAnswers: question.acceptedAnswers ? [...question.acceptedAnswers] : undefined,
    numeric: question.numeric ? { ...question.numeric } : undefined,
  };
}

export interface ChangeTypeOptions {
  language?: Quiz["language"];
  /**
   * Answers the question had before it became a typed-answer question. Lets the
   * editor bring choices back when a lecturer flips single → short answer → single.
   */
  rememberedAnswers?: AnswerOption[];
}

const parseNumber = (text: string): number | null => {
  const n = Number(text.trim().replace(/\s/g, "").replace(",", "."));
  return text.trim() && Number.isFinite(n) ? n : null;
};

const formatNumber = (n: number) => String(n);

/**
 * Switch a question's type while keeping as much authored content as possible:
 * prompt, media, explanation, timing, topic and learning outcome always survive;
 * answers are translated between shapes (choices ⇄ accepted answers ⇄ numeric).
 */
export function changeQuestionType(question: Question, type: QuestionType, options: ChangeTypeOptions = {}): Question {
  if (question.type === type) return question;
  const language = options.language ?? "id";

  const base: Question = {
    id: question.id,
    position: question.position,
    type,
    prompt: question.prompt,
    description: question.description,
    explanation: question.explanation,
    mediaUrl: question.mediaUrl,
    timeLimit: question.timeLimit,
    topic: question.topic,
    learningOutcome: question.learningOutcome,
    // Polls never score; coming back from a poll restores the standard value.
    points: type === "poll" ? 0 : question.type === "poll" && question.points === 0 ? DEFAULT_POINTS : question.points,
    answers: [],
  };

  // Texts that represent "the right answer" in the old shape.
  const correctTexts = (() => {
    if (question.type === "short_answer") return (question.acceptedAnswers ?? []).filter((a) => a.trim());
    if (question.type === "numeric")
      return question.numeric && Number.isFinite(question.numeric.value) ? [formatNumber(question.numeric.value)] : [];
    if (question.type === "ordering" || question.type === "poll") return [];
    return question.answers.filter((a) => a.isCorrect && a.text.trim()).map((a) => a.text);
  })();

  // Choice-like source list, before shape-specific rules. Accepted spellings are
  // synonyms ("DNS", "Domain Name System"), not separate choices: only the first one
  // becomes the correct choice, the lecturer writes the distractors.
  const sourceAnswers: AnswerOption[] = usesAnswerList(question.type)
    ? question.answers
    : options.rememberedAnswers && options.rememberedAnswers.length > 0
      ? options.rememberedAnswers
      : correctTexts.slice(0, 1).map((text, i) => newAnswer(i, text, true));

  switch (type) {
    case "short_answer":
      return {
        ...base,
        acceptedAnswers: correctTexts.length > 0 ? correctTexts.slice(0, LIMITS.acceptedAnswers) : [""],
      };

    case "numeric": {
      const value = correctTexts.map(parseNumber).find((n): n is number => n !== null);
      return {
        ...base,
        numeric:
          value !== undefined
            ? { value, tolerance: question.numeric?.tolerance ?? 0, unit: question.numeric?.unit }
            : question.numeric,
      };
    }

    case "true_false": {
      const labels = TRUE_FALSE_LABELS[language];
      // Keep the verdict if the old question was already a two-way choice.
      const oldCorrect = question.answers.length === 2 ? question.answers.findIndex((a) => a.isCorrect) : -1;
      return { ...base, answers: labels.map((text, i) => newAnswer(i, text, i === oldCorrect)) };
    }

    case "single": {
      let seenCorrect = false;
      const answers = sourceAnswers.slice(0, maxAnswers(type)).map((a) => {
        const keep = a.isCorrect && !seenCorrect && question.type !== "ordering" && question.type !== "poll";
        if (keep) seenCorrect = true;
        return { ...a, isCorrect: keep };
      });
      return { ...base, answers: padAnswers(answers) };
    }

    case "multiple": {
      const answers = sourceAnswers.slice(0, maxAnswers(type)).map((a) => ({
        ...a,
        isCorrect: question.type === "ordering" || question.type === "poll" ? false : a.isCorrect,
      }));
      return { ...base, answers: padAnswers(answers) };
    }

    case "poll":
    case "ordering": {
      const answers = sourceAnswers.slice(0, maxAnswers(type)).map((a) => ({ ...a, isCorrect: false }));
      return { ...base, answers: padAnswers(answers) };
    }
  }
}

/** Ensure at least two rows (keeps the editor useful after a lossy conversion). */
function padAnswers(answers: AnswerOption[]): AnswerOption[] {
  const out = reindex(answers);
  while (out.length < LIMITS.answersMin) out.push(newAnswer(out.length));
  return out;
}

/** Move an item one step; returns the same array when the move is impossible. */
export function moveItem<T extends { position: number }>(items: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return [...items];
  const next = [...items];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return reindex(next);
}
