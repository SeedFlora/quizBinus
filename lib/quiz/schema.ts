/**
 * Quiz authoring schemas.
 *
 * Two layers, on purpose:
 *   1. STRUCTURE (zod): the shape a quiz must have to be stored, loaded, imported or
 *      produced by an AI provider. Drafts are allowed to be incomplete here: an empty
 *      prompt is still a valid *draft*.
 *   2. READINESS (validateQuiz): the rules a quiz must satisfy before it can be played.
 *      Returns per-question issues with stable codes the editor maps to i18n keys
 *      (`editor.validation.<code>`), so the UI can point at the exact field.
 */

import { z } from "zod";
import {
  DIFFICULTIES,
  GAME_MODES,
  QUESTION_TYPES,
  type Question,
  type QuestionType,
  type Quiz,
} from "@/lib/game/types";

/* ------------------------------------------------------------------ */
/* Limits shared by the schema, the editor counters and the AI mock    */
/* ------------------------------------------------------------------ */

export const LIMITS = {
  title: 120,
  description: 500,
  prompt: 300,
  questionDescription: 400,
  answer: 120,
  explanation: 600,
  shortField: 160,
  acceptedAnswers: 8,
  /** Choice questions map to four answer identities (A–D), never more. */
  choiceMax: 4,
  orderingMax: 6,
  answersMin: 2,
  questions: 100,
  timeMin: 5,
  timeMax: 120,
  pointsMax: 10_000,
} as const;

/** Types whose answers are chosen from the `answers` list. */
export const CHOICE_TYPES = ["single", "multiple", "true_false", "poll"] as const satisfies readonly QuestionType[];

export function usesAnswerList(type: QuestionType): boolean {
  return type !== "short_answer" && type !== "numeric";
}

export function maxAnswers(type: QuestionType): number {
  if (type === "true_false") return 2;
  if (type === "ordering") return LIMITS.orderingMax;
  if (usesAnswerList(type)) return LIMITS.choiceMax;
  return 0;
}

/* ------------------------------------------------------------------ */
/* Structure                                                           */
/* ------------------------------------------------------------------ */

/**
 * True for names Object.prototype already has ("__proto__", "constructor", "toString"…).
 * Ids become object keys on the game server (answers and reveals by question id, players
 * by id), where such a name reaches the shared prototype instead of a fresh entry
 * (prototype pollution of the whole server process). Never valid as an id.
 */
export function isPrototypeKey(value: string): boolean {
  return value in Object.prototype;
}

const id = z
  .string()
  .min(1)
  .max(80)
  .refine((v) => !isPrototypeKey(v), "reserved_id");
const optionalText = (max: number) => z.string().max(max).optional();

export const AnswerOptionSchema = z.object({
  id,
  position: z.number().int().min(0),
  text: z.string().max(LIMITS.answer),
  isCorrect: z.boolean(),
});

// zod 4 numbers reject Infinity/NaN, so a stored spec is always finite.
export const NumericSpecSchema = z.object({
  value: z.number(),
  tolerance: z.number().min(0),
  unit: optionalText(24),
});

export const QuestionSchema = z.object({
  id,
  position: z.number().int().min(0),
  type: z.enum(QUESTION_TYPES),
  prompt: z.string().max(LIMITS.prompt),
  description: optionalText(LIMITS.questionDescription),
  explanation: optionalText(LIMITS.explanation),
  // An uploaded image served by this app (/api/media/<file>, database mode), a data URL
  // (memory mode, resized client-side) or an external http(s) URL.
  mediaUrl: z
    .string()
    .refine(
      (v) =>
        /^\/api\/media\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(v) ||
        /^https?:\/\//.test(v) ||
        /^data:image\/(webp|jpeg|png);base64,/.test(v),
      "invalid_media",
    )
    .optional(),
  timeLimit: z.number().int().min(LIMITS.timeMin).max(LIMITS.timeMax),
  points: z.number().int().min(0).max(LIMITS.pointsMax),
  topic: optionalText(LIMITS.shortField),
  learningOutcome: optionalText(LIMITS.shortField),
  answers: z.array(AnswerOptionSchema).max(LIMITS.orderingMax),
  acceptedAnswers: z.array(z.string().max(LIMITS.answer)).max(LIMITS.acceptedAnswers).optional(),
  numeric: NumericSpecSchema.optional(),
});

export const CourseInfoSchema = z.object({
  courseCode: z.string().max(24),
  courseName: z.string().max(LIMITS.shortField),
  className: optionalText(24),
  lecturer: optionalText(LIMITS.shortField),
  learningOutcome: optionalText(LIMITS.shortField),
});

export const QuizSchema = z.object({
  id,
  ownerId: z.string().max(80),
  title: z.string().max(LIMITS.title),
  description: optionalText(LIMITS.description),
  course: CourseInfoSchema,
  topic: optionalText(LIMITS.shortField),
  difficulty: z.enum(DIFFICULTIES),
  language: z.enum(["id", "en"]),
  visibility: z.enum(["private", "unlisted", "public"]),
  mode: z.enum(GAME_MODES),
  questions: z.array(QuestionSchema).max(LIMITS.questions),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Compile-time guard: the schema must describe exactly the domain types.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _quizShape: Same<Quiz, z.infer<typeof QuizSchema>> = true;
const _questionShape: Same<Question, z.infer<typeof QuestionSchema>> = true;
void _quizShape;
void _questionShape;

/** Parse untrusted quiz data (storage, import, provider output). */
export function parseQuiz(input: unknown): { ok: true; quiz: Quiz } | { ok: false; error: string } {
  const result = QuizSchema.safeParse(input);
  if (result.success) return { ok: true, quiz: result.data };
  return { ok: false, error: z.prettifyError(result.error) };
}

/* ------------------------------------------------------------------ */
/* Readiness                                                           */
/* ------------------------------------------------------------------ */

export const QUESTION_ISSUE_CODES = [
  "promptRequired",
  "needTwoAnswers",
  "tooManyAnswers",
  "answerEmpty",
  "answerDuplicate",
  "needCorrect",
  "singleOneCorrect",
  "needAccepted",
  "numericValue",
  "timeLimit",
  "points",
] as const;
export type QuestionIssueCode = (typeof QUESTION_ISSUE_CODES)[number];

export const QUIZ_ISSUE_CODES = ["titleRequired", "noQuestions"] as const;
export type QuizIssueCode = (typeof QUIZ_ISSUE_CODES)[number];

/** Which editor control an issue belongs to (used for inline errors and focus). */
export type IssueField = "prompt" | "answers" | "accepted" | "numeric" | "timeLimit" | "points";

export interface QuestionIssue {
  code: QuestionIssueCode;
  field: IssueField;
  /** Set when the issue concerns one specific answer row. */
  answerId?: string;
}

export interface QuizValidation {
  quizIssues: QuizIssueCode[];
  /** Keyed by question id; questions without issues have an empty array. */
  questions: Record<string, QuestionIssue[]>;
  /** Total number of things to fix (quiz + all questions). */
  count: number;
  ready: boolean;
  firstInvalidQuestionId: string | null;
}

export function validateQuestion(question: Question): QuestionIssue[] {
  const issues: QuestionIssue[] = [];
  const push = (code: QuestionIssueCode, field: IssueField, answerId?: string) =>
    issues.push(answerId ? { code, field, answerId } : { code, field });

  if (!question.prompt.trim()) push("promptRequired", "prompt");

  if (usesAnswerList(question.type)) {
    const answers = question.answers;
    if (answers.length < LIMITS.answersMin) push("needTwoAnswers", "answers");
    if (answers.length > maxAnswers(question.type)) push("tooManyAnswers", "answers");

    const empty = answers.find((a) => !a.text.trim());
    if (empty) push("answerEmpty", "answers", empty.id);

    const seen = new Set<string>();
    for (const a of answers) {
      const key = a.text.trim().toLowerCase();
      if (!key) continue;
      if (seen.has(key)) {
        push("answerDuplicate", "answers", a.id);
        break;
      }
      seen.add(key);
    }

    const correct = answers.filter((a) => a.isCorrect).length;
    if (question.type === "single" || question.type === "true_false") {
      if (correct === 0) push("needCorrect", "answers");
      else if (correct > 1) push("singleOneCorrect", "answers");
    } else if (question.type === "multiple" && correct === 0) {
      push("needCorrect", "answers");
    }
    // poll: no correct answer by design. ordering: authoring order IS the answer.
  }

  if (question.type === "short_answer" && !(question.acceptedAnswers ?? []).some((a) => a.trim())) {
    push("needAccepted", "accepted");
  }

  if (
    question.type === "numeric" &&
    (!question.numeric ||
      !Number.isFinite(question.numeric.value) ||
      !Number.isFinite(question.numeric.tolerance) ||
      question.numeric.tolerance < 0)
  ) {
    push("numericValue", "numeric");
  }

  if (
    !Number.isInteger(question.timeLimit) ||
    question.timeLimit < LIMITS.timeMin ||
    question.timeLimit > LIMITS.timeMax
  ) {
    push("timeLimit", "timeLimit");
  }
  if (!Number.isInteger(question.points) || question.points < 0 || question.points > LIMITS.pointsMax) {
    push("points", "points");
  }

  return issues;
}

export function validateQuiz(quiz: Quiz): QuizValidation {
  const quizIssues: QuizIssueCode[] = [];
  if (!quiz.title.trim()) quizIssues.push("titleRequired");
  if (quiz.questions.length === 0) quizIssues.push("noQuestions");

  const questions: Record<string, QuestionIssue[]> = {};
  let count = quizIssues.length;
  let firstInvalidQuestionId: string | null = null;
  for (const question of quiz.questions) {
    const issues = validateQuestion(question);
    questions[question.id] = issues;
    count += issues.length;
    if (issues.length > 0 && firstInvalidQuestionId === null) firstInvalidQuestionId = question.id;
  }

  return { quizIssues, questions, count, ready: count === 0, firstInvalidQuestionId };
}
