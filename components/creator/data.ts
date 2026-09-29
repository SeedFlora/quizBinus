/**
 * Creator data access. Screens call these functions and never touch storage
 * directly, so the two storage modes (see ./storage-context.tsx) swap in one place:
 *   database  quizzes via /api/quizzes, sessions via /api/sessions (Postgres behind them)
 *   browser   quizzes in localStorage + seeds; sessions from the game server's memory,
 *             from this browser (offline transport) and the simulated demo history
 *
 * Client-only at runtime: the local repository and session store read localStorage.
 */

import type { Difficulty, Quiz } from "@/lib/game/types";
import { fetchServerSessions, fetchSessionEngineState, type ServerSessionItem } from "@/lib/analytics/server-source";
import { ApiQuizRepository } from "@/lib/quiz/api-repository";
import { getLocalQuizRepository, toListItem, type QuizListItem, type QuizRepository } from "@/lib/quiz/repository";
import { newId } from "@/lib/quiz/factory";
import { SEED_QUIZZES } from "@/lib/seed/quizzes";
import { DEMO_SESSION_ID } from "@/lib/demo/simulate";
import { listStoredSessionIds, readStoredSession } from "@/lib/realtime/local/runtime";
import { campusDayStart, DAY_MS } from "./format";
import { demoHistory, summarizeEngineState, type SessionRecord, type SessionStatus } from "./session-records";
import type { CreatorStorage } from "./storage-context";

export type { QuizListItem } from "@/lib/quiz/repository";
export type { SessionRecord, SessionStatus } from "./session-records";

/* ------------------------------------------------------------------ */
/* Quizzes                                                             */
/* ------------------------------------------------------------------ */

let api: ApiQuizRepository | null = null;

export function getQuizRepository(storage: CreatorStorage): QuizRepository {
  if (storage === "browser") return getLocalQuizRepository();
  return (api ??= new ApiQuizRepository());
}

const byUpdatedDesc = (a: QuizListItem, b: QuizListItem) => b.updatedAt.localeCompare(a.updatedAt);

/**
 * First paint. Browser storage: the seed library, identical on server and client
 * (local edits replace it right after mount). Database: nothing yet (loading).
 */
export function initialQuizList(storage: CreatorStorage): QuizListItem[] | null {
  return storage === "browser" ? SEED_QUIZZES.map(toListItem).sort(byUpdatedDesc) : null;
}

export async function listQuizzes(storage: CreatorStorage): Promise<QuizListItem[]> {
  const items = await getQuizRepository(storage).list();
  return [...items].sort(byUpdatedDesc);
}

/** Deep copy with fresh ids for the quiz, every question and every answer. */
export function copyQuiz(quiz: Quiz, titleSuffix: string, now = new Date()): Quiz {
  const stamp = now.toISOString();
  return {
    ...quiz,
    id: newId(),
    title: `${quiz.title} ${titleSuffix}`.trim(),
    createdAt: stamp,
    updatedAt: stamp,
    course: { ...quiz.course },
    questions: quiz.questions.map((q) => ({
      ...q,
      id: newId(),
      answers: q.answers.map((a) => ({ ...a, id: newId() })),
      acceptedAnswers: q.acceptedAnswers ? [...q.acceptedAnswers] : undefined,
      numeric: q.numeric ? { ...q.numeric } : undefined,
    })),
  };
}

export async function duplicateQuiz(
  storage: CreatorStorage,
  id: string,
  titleSuffix: string,
): Promise<QuizListItem | null> {
  const repo = getQuizRepository(storage);
  const quiz = await repo.get(id);
  if (!quiz) return null;
  return toListItem(await repo.save(copyQuiz(quiz, titleSuffix)));
}

export async function deleteQuiz(storage: CreatorStorage, id: string): Promise<void> {
  await getQuizRepository(storage).remove(id);
}

export interface LibraryFilter {
  query: string;
  course: string;
  difficulty: Difficulty | "all";
}

export function filterQuizzes(items: QuizListItem[], filter: LibraryFilter): QuizListItem[] {
  const needle = filter.query.trim().toLowerCase();
  return items.filter((q) => {
    if (filter.course && q.courseCode !== filter.course) return false;
    if (filter.difficulty !== "all" && q.difficulty !== filter.difficulty) return false;
    if (!needle) return true;
    return [q.title, q.courseCode, q.courseName, q.topic ?? "", q.className ?? ""].some((field) =>
      field.toLowerCase().includes(needle),
    );
  });
}

/** Distinct courses in the library, for the course filter. */
export function coursesOf(items: QuizListItem[]): Array<{ code: string; name: string }> {
  const seen = new Map<string, string>();
  for (const q of items) if (q.courseCode && !seen.has(q.courseCode)) seen.set(q.courseCode, q.courseName);
  return [...seen].map(([code, name]) => ({ code, name })).sort((a, b) => a.code.localeCompare(b.code));
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

/**
 * Sessions hosted from this browser over the offline transport. Solo player demos
 * (a virtual host driving bots) are not the lecturer's classes and stay out.
 */
export function listLocalSessions(now: number): SessionRecord[] {
  const records: SessionRecord[] = [];
  for (const id of listStoredSessionIds()) {
    const stored = readStoredSession(id);
    if (!stored || stored.virtualHost) continue;
    const state = stored.persisted.engine;
    const record = summarizeEngineState(state, { now, demo: state.sessionId === DEMO_SESSION_ID });
    // A lobby that expired or was closed before the game started is noise, not history.
    if (record.status === "ended" && state.startedAt === null) continue;
    records.push(record);
  }
  return records;
}

/** Newest server sessions summarized from their full report; older ones from the list row. */
const DETAILED_SESSIONS = 8;

const recordStatus = (status: ServerSessionItem["status"]): SessionStatus =>
  status === "lobby" ? "lobby" : status === "live" ? "live" : "ended";

/** A server session known only by its list row (no per-question numbers). */
function summaryRecord(item: ServerSessionItem, now: number): SessionRecord {
  return {
    id: item.id,
    // A deleted quiz leaves the session behind; its report still carries the quiz snapshot.
    quizId: item.quizId ?? item.id,
    quizTitle: item.quizTitle,
    courseCode: item.courseCode,
    courseName: "",
    roomCode: item.roomCode,
    status: recordStatus(item.status),
    players: item.players,
    questionsPlayed: 0,
    totalQuestions: 0,
    accuracy: item.accuracy,
    participation: null,
    answered: 0,
    expected: 0,
    correct: 0,
    hardestTopic: null,
    startedAt: item.startedAt ?? item.createdAt ?? now,
    endedAt: item.endedAt,
    demo: item.id === DEMO_SESSION_ID,
  };
}

/** Finished sessions never change: their detailed records are kept for the page's lifetime. */
const finishedRecords = new Map<string, SessionRecord>();

async function detailedRecord(item: ServerSessionItem, now: number): Promise<SessionRecord> {
  const cached = finishedRecords.get(item.id);
  if (cached) return cached;
  const state = await fetchSessionEngineState(item.id).catch(() => null);
  if (!state) return summaryRecord(item, now);
  const record: SessionRecord = {
    ...summarizeEngineState(state, { now, demo: item.id === DEMO_SESSION_ID }),
    // The list knows what the runtime knows (restarts, expiry); it wins over the snapshot.
    status: recordStatus(item.status),
    quizId: item.quizId ?? state.quiz.id,
  };
  if (record.status === "ended") finishedRecords.set(item.id, record);
  return record;
}

/** The host's sessions on the game server as history records, newest first. */
export async function listServerSessions(now: number): Promise<SessionRecord[]> {
  // Lobbies closed before the game started are noise, not history.
  const items = (await fetchServerSessions()).filter((s) => s.startedAt !== null || recordStatus(s.status) !== "ended");
  return Promise.all(
    items.map((item, index) => (index < DETAILED_SESSIONS ? detailedRecord(item, now) : summaryRecord(item, now))),
  );
}

const byStartedDesc = (a: SessionRecord, b: SessionRecord) => b.startedAt - a.startedAt;

/**
 * First paint. Browser storage: the simulated history (deterministic, safe to render
 * on the server). Database: nothing until the lecturer's sessions arrive.
 */
export function initialSessionHistory(storage: CreatorStorage, now: number): SessionRecord[] | null {
  return storage === "browser" ? demoHistory(now).sort(byStartedDesc) : null;
}

/**
 * Everything the lecturer should see, newest first.
 * Database: the lecturer's own sessions only.
 * Browser: live sessions on the game server, sessions hosted from this browser and
 * the demo history (so the page is never empty). A server that cannot be reached
 * only hides its own sessions.
 */
export async function listSessionHistory(storage: CreatorStorage, now: number): Promise<SessionRecord[]> {
  if (storage === "database") return (await listServerSessions(now)).sort(byStartedDesc);
  const server = await listServerSessions(now).catch(() => []);
  const onServer = new Set(server.map((r) => r.id));
  const local = listLocalSessions(now).filter((r) => !onServer.has(r.id));
  return [...server, ...local, ...demoHistory(now)].sort(byStartedDesc);
}

export interface TeachingPulse {
  /** Share of expected answers that arrived, 0..1. */
  engagement: number | null;
  accuracy: number | null;
  /** Sessions the accuracy is drawn from. */
  sessionsMeasured: number;
  sessionsThisWeek: number;
  students: number;
}

/** Weighted totals across sessions: big classes count for more than a trial run. */
export function teachingPulse(records: SessionRecord[], now: number): TeachingPulse {
  const measured = records.filter((r) => r.expected > 0);
  const answered = measured.reduce((sum, r) => sum + r.answered, 0);
  const expected = measured.reduce((sum, r) => sum + r.expected, 0);
  const correct = measured.reduce((sum, r) => sum + r.correct, 0);
  // Older server sessions arrive as summaries only (accuracy, class size): use them
  // when nothing more detailed exists, weighted by class size.
  const summaries = records.filter((r) => r.expected === 0 && r.accuracy !== null && r.players > 0);
  const summaryPlayers = summaries.reduce((sum, r) => sum + r.players, 0);
  const summaryCorrect = summaries.reduce((sum, r) => sum + (r.accuracy ?? 0) * r.players, 0);
  const weekStart = campusDayStart(now) - 6 * DAY_MS;
  return {
    engagement: expected > 0 ? Math.min(1, answered / expected) : null,
    accuracy: answered > 0 ? correct / answered : summaryPlayers > 0 ? summaryCorrect / summaryPlayers : null,
    sessionsMeasured: answered > 0 ? measured.length : summaries.length,
    sessionsThisWeek: records.filter((r) => r.startedAt >= weekStart).length,
    students: records.reduce((sum, r) => sum + r.players, 0),
  };
}

/* ------------------------------------------------------------------ */
/* Links                                                               */
/* ------------------------------------------------------------------ */

export const editPath = (quizId: string) => `/quizzes/${encodeURIComponent(quizId)}/edit`;
export const analyticsPath = (quizId: string, sessionId?: string) =>
  `/quizzes/${encodeURIComponent(quizId)}/analytics${sessionId ? `?session=${encodeURIComponent(sessionId)}` : ""}`;
export const hostPath = (session: Pick<SessionRecord, "id" | "status">) =>
  `/host/session/${encodeURIComponent(session.id)}${session.status === "lobby" ? "/lobby" : ""}`;
