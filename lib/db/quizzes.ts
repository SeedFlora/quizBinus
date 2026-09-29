import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  DIFFICULTIES,
  GAME_MODES,
  QUESTION_TYPES,
  TIME_LIMITS,
  type AnswerOption,
  type Question,
  type QuestionType,
  type Quiz,
} from "@/lib/game/types";
import type { QuizListItem } from "@/lib/quiz/repository";
import { requireDb } from "./client";
import { isUuid } from "./errors";
import { stableUuid } from "./ids";
import { answers, questions, quizzes, type QuestionMetadata } from "./schema";

/**
 * Quizzes ("arenas") in Postgres: quizzes → questions → answers, always scoped to
 * the owning lecturer (every query filters by owner_id; there is no RLS here, the
 * owner check IS the authorization).
 *
 * Ids: the tables use uuids. Readable ids (seed "os-battle", editor drafts) map
 * deterministically per owner (stableUuid), so retrying a save never duplicates.
 */

type QuizRow = typeof quizzes.$inferSelect;
type QuestionRow = typeof questions.$inferSelect;
type AnswerRow = typeof answers.$inferSelect;

const VISIBILITIES = ["private", "unlisted", "public"] as const;

/** Thrown by saveQuiz when the uuid belongs to another lecturer's quiz. */
export class QuizOwnershipError extends Error {
  readonly code = "forbidden";
  constructor(quizId: string) {
    super(`quiz ${quizId} belongs to another lecturer`);
    this.name = "QuizOwnershipError";
  }
}

/* ------------------------------------------------------------------ */
/* Row → domain                                                        */
/* ------------------------------------------------------------------ */

function oneOf<T extends string>(allowed: readonly T[], value: string, fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

const opt = (value: string | null): string | undefined => value ?? undefined;
const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;

function isPlayableType(type: string): type is QuestionType {
  return (QUESTION_TYPES as readonly string[]).includes(type);
}

function toQuestion(row: QuestionRow, rowAnswers: AnswerRow[], index: number): Question {
  const meta = row.metadata ?? {};
  return {
    id: row.id,
    position: index,
    type: row.type as QuestionType,
    prompt: row.prompt,
    description: opt(row.description),
    explanation: opt(row.explanation),
    mediaUrl: opt(row.mediaUrl),
    timeLimit: row.timeLimit,
    points: row.points,
    topic: opt(row.topic),
    learningOutcome: opt(row.learningOutcome),
    answers: [...rowAnswers]
      .sort(byPosition)
      .map((a): AnswerOption => ({ id: a.id, position: a.position, text: a.text, isCorrect: a.isCorrect })),
    ...(Array.isArray(meta.acceptedAnswers) ? { acceptedAnswers: meta.acceptedAnswers } : {}),
    ...(meta.numeric ? { numeric: meta.numeric } : {}),
  };
}

function toQuiz(row: QuizRow, questionRows: QuestionRow[], answerRows: AnswerRow[]): Quiz {
  const byQuestion = new Map<string, AnswerRow[]>();
  for (const a of answerRows) {
    const list = byQuestion.get(a.questionId) ?? [];
    list.push(a);
    byQuestion.set(a.questionId, list);
  }
  return {
    id: row.id,
    ownerId: row.ownerId,
    title: row.title,
    description: opt(row.description),
    course: {
      courseCode: row.courseCode ?? "",
      courseName: row.courseName ?? "",
      className: opt(row.className),
      lecturer: opt(row.lecturerName),
      learningOutcome: opt(row.learningOutcome),
    },
    topic: opt(row.topic),
    difficulty: oneOf(DIFFICULTIES, row.difficulty, "sedang"),
    language: row.language === "en" ? "en" : "id",
    visibility: oneOf(VISIBILITIES, row.visibility, "private"),
    mode: oneOf(GAME_MODES, row.mode, "classic"),
    // Designed-for types (image_hotspot, …) are stored but not editable or playable yet.
    questions: questionRows
      .filter((q) => isPlayableType(q.type))
      .sort(byPosition)
      .map((q, i) => toQuestion(q, byQuestion.get(q.id) ?? [], i)),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Domain → rows                                                       */
/* ------------------------------------------------------------------ */

const nul = (value: string | undefined): string | null => (value?.trim() ? value : null);

/** The column only accepts the editor's presets; imported/AI quizzes snap to the nearest. */
export function snapTimeLimit(seconds: number): number {
  let best: number = TIME_LIMITS[0];
  for (const t of TIME_LIMITS) if (Math.abs(t - seconds) <= Math.abs(best - seconds)) best = t;
  return best;
}

function clampPoints(points: number): number {
  return Number.isFinite(points) ? Math.min(10_000, Math.max(0, Math.round(points))) : 1000;
}

function questionMetadata(q: Question): QuestionMetadata {
  const meta: QuestionMetadata = {};
  if (q.type === "short_answer" && q.acceptedAnswers) meta.acceptedAnswers = q.acceptedAnswers;
  if (q.type === "numeric" && q.numeric) {
    meta.numeric = {
      value: q.numeric.value,
      tolerance: q.numeric.tolerance,
      ...(q.numeric.unit ? { unit: q.numeric.unit } : {}),
    };
  }
  return meta;
}

function quizColumns(quiz: Quiz) {
  return {
    title: quiz.title,
    description: nul(quiz.description),
    courseCode: nul(quiz.course.courseCode),
    courseName: nul(quiz.course.courseName),
    className: nul(quiz.course.className),
    lecturerName: nul(quiz.course.lecturer),
    learningOutcome: nul(quiz.course.learningOutcome),
    topic: nul(quiz.topic),
    difficulty: quiz.difficulty,
    language: quiz.language,
    visibility: quiz.visibility,
    mode: quiz.mode,
  };
}

/** The uuid a quiz is stored under for this owner. */
export function quizUuidFor(id: string, ownerId: string): string {
  return isUuid(id) ? id.toLowerCase() : stableUuid(`quiz:${ownerId}:${id}`);
}

/**
 * Picks a row id: uuids pass through (stable across saves), readable ids map
 * stably. Ids taken by another quiz's rows, or repeated in the input, get a fresh
 * derived id so a malformed payload can never hijack or collide with other rows.
 */
function allocate(id: string, derivedKey: string, taken: Set<string>): string {
  let candidate = isUuid(id) ? id.toLowerCase() : stableUuid(derivedKey);
  for (let i = 1; taken.has(candidate); i++) candidate = stableUuid(`${derivedKey}#${i}`);
  taken.add(candidate);
  return candidate;
}

/* ------------------------------------------------------------------ */
/* Repository functions                                                */
/* ------------------------------------------------------------------ */

export async function listQuizzes(ownerId: string): Promise<QuizListItem[]> {
  if (!isUuid(ownerId)) return [];
  // Explicit aliases: in a single-table select drizzle renders columns unqualified,
  // which inside this correlated subquery would bind to questions.id.
  const playable = sql.join(
    QUESTION_TYPES.map((t) => sql`${t}`),
    sql`, `,
  );
  const questionCount = sql<number>`(select count(*)::int from "questions" qn where qn."quiz_id" = "quizzes"."id" and qn."type" in (${playable}))`;
  const rows = await requireDb()
    .select({
      id: quizzes.id,
      title: quizzes.title,
      courseCode: quizzes.courseCode,
      courseName: quizzes.courseName,
      className: quizzes.className,
      topic: quizzes.topic,
      difficulty: quizzes.difficulty,
      updatedAt: quizzes.updatedAt,
      questionCount,
    })
    .from(quizzes)
    .where(eq(quizzes.ownerId, ownerId))
    .orderBy(desc(quizzes.updatedAt));
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    courseCode: row.courseCode ?? "",
    courseName: row.courseName ?? "",
    className: opt(row.className),
    questionCount: Number(row.questionCount),
    updatedAt: row.updatedAt.toISOString(),
    difficulty: oneOf(DIFFICULTIES, row.difficulty, "sedang"),
    topic: opt(row.topic),
  }));
}

export async function getQuiz(id: string, ownerId: string): Promise<Quiz | null> {
  if (!isUuid(ownerId)) return null;
  const quizId = quizUuidFor(id, ownerId);
  const db = requireDb();
  const [row] = await db
    .select()
    .from(quizzes)
    .where(and(eq(quizzes.id, quizId), eq(quizzes.ownerId, ownerId)))
    .limit(1);
  if (!row) return null;
  const questionRows = await db
    .select()
    .from(questions)
    .where(eq(questions.quizId, quizId))
    .orderBy(asc(questions.position));
  const answerRows = questionRows.length
    ? await db
        .select()
        .from(answers)
        .where(
          inArray(
            answers.questionId,
            questionRows.map((q) => q.id),
          ),
        )
        .orderBy(asc(answers.position))
    : [];
  return toQuiz(row, questionRows, answerRows);
}

/**
 * Upserts the quiz and replaces its questions/answers in ONE transaction. Questions
 * keep array order (the engine plays `quiz.questions` in order); answers keep their
 * `position` order (A/B/C/D). Returns the stored quiz with database ids and
 * timestamps, which may differ from the input's readable ids.
 *
 * Throws QuizOwnershipError when `quiz.id` is another lecturer's quiz.
 */
export async function saveQuiz(quiz: Quiz, ownerId: string): Promise<Quiz> {
  if (!isUuid(ownerId)) throw new Error("saveQuiz: ownerId must be a user id");
  const quizId = quizUuidFor(quiz.id, ownerId);

  await requireDb().transaction(async (tx) => {
    // Insert-or-lock: two concurrent first saves of one draft serialize on the row
    // instead of failing on the primary key.
    const inserted = await tx
      .insert(quizzes)
      .values({ id: quizId, ownerId, ...quizColumns(quiz) })
      .onConflictDoNothing({ target: quizzes.id })
      .returning({ id: quizzes.id });
    if (inserted.length === 0) {
      const [existing] = await tx
        .select({ ownerId: quizzes.ownerId })
        .from(quizzes)
        .where(eq(quizzes.id, quizId))
        .for("update");
      if (!existing || existing.ownerId !== ownerId) throw new QuizOwnershipError(quizId);
      await tx
        .update(quizzes)
        .set({ ...quizColumns(quiz), updatedAt: new Date() })
        .where(eq(quizzes.id, quizId));
      await tx.delete(questions).where(eq(questions.quizId, quizId));
    }

    // Row ids still used elsewhere (another quiz) must not be reused here.
    const wantedQuestionIds = quiz.questions.map((q) => q.id).filter(isUuid);
    const wantedAnswerIds = quiz.questions.flatMap((q) => q.answers.map((a) => a.id)).filter(isUuid);
    const takenQuestions = new Set(
      wantedQuestionIds.length
        ? (await tx.select({ id: questions.id }).from(questions).where(inArray(questions.id, wantedQuestionIds))).map(
            (r) => r.id,
          )
        : [],
    );
    const takenAnswers = new Set(
      wantedAnswerIds.length
        ? (await tx.select({ id: answers.id }).from(answers).where(inArray(answers.id, wantedAnswerIds))).map(
            (r) => r.id,
          )
        : [],
    );

    const questionValues: (typeof questions.$inferInsert)[] = [];
    const answerValues: (typeof answers.$inferInsert)[] = [];
    quiz.questions.forEach((q, index) => {
      const questionId = allocate(q.id, `question:${quizId}:${q.id}`, takenQuestions);
      questionValues.push({
        id: questionId,
        quizId,
        position: index,
        type: q.type,
        prompt: q.prompt,
        description: nul(q.description),
        explanation: nul(q.explanation),
        mediaUrl: nul(q.mediaUrl),
        timeLimit: snapTimeLimit(q.timeLimit),
        points: clampPoints(q.points),
        topic: nul(q.topic),
        learningOutcome: nul(q.learningOutcome),
        metadata: questionMetadata(q),
      });
      [...q.answers].sort(byPosition).forEach((a, position) => {
        answerValues.push({
          id: allocate(a.id, `answer:${questionId}:${a.id}`, takenAnswers),
          questionId,
          position,
          text: a.text,
          isCorrect: a.isCorrect,
        });
      });
    });
    if (questionValues.length) await tx.insert(questions).values(questionValues);
    if (answerValues.length) await tx.insert(answers).values(answerValues);
  });

  const saved = await getQuiz(quizId, ownerId);
  if (!saved) throw new Error(`saveQuiz: ${quizId} not readable after save`);
  return saved;
}

/** True when a quiz was deleted. Sessions keep their history (quiz_id set null). */
export async function deleteQuiz(id: string, ownerId: string): Promise<boolean> {
  if (!isUuid(ownerId)) return false;
  const removed = await requireDb()
    .delete(quizzes)
    .where(and(eq(quizzes.id, quizUuidFor(id, ownerId)), eq(quizzes.ownerId, ownerId)))
    .returning({ id: quizzes.id });
  return removed.length > 0;
}

export async function countQuizzes(ownerId: string): Promise<number> {
  if (!isUuid(ownerId)) return 0;
  const [row] = await requireDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(quizzes)
    .where(eq(quizzes.ownerId, ownerId));
  return Number(row?.n ?? 0);
}
