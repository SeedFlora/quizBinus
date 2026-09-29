/**
 * Where analytics data comes from. Client-only at runtime: browser sessions live in
 * this browser's localStorage and server reads use the lecturer's cookie.
 *
 *   "demo" / no id      a complete simulated class (real engine, 42 students)
 *   "demo-h-…"          a dated demo-history session (same engine the history list uses)
 *   browser session id  a session hosted from this tab (offline transport), memory mode only
 *   server session id   the game server's EngineState: live from the runtime, or from
 *                       Postgres in database mode (./server-source.ts)
 *
 * Every source ends in the same pure `computeSessionAnalytics(EngineState)`.
 */

import type { EngineState } from "@/lib/game/engine";
import type { Quiz } from "@/lib/game/types";
import { DEMO_HISTORY_PREFIX, demoHistoryEntries, simulateDemoHistorySession } from "@/lib/demo/history";
import { DEMO_SESSION_ID, simulateGame } from "@/lib/demo/simulate";
import type { QuizRepository } from "@/lib/quiz/repository";
import { listStoredSessionIds, readStoredSession } from "@/lib/realtime/local/runtime";
import { getSeedQuiz, OS_BATTLE } from "@/lib/seed/quizzes";
import { computeSessionAnalytics, type SessionAnalytics, type SessionStatus } from "./compute";
import { fetchServerSessions, fetchSessionEngineState, type ServerSessionItem } from "./server-source";

export type AnalyticsSource = "local" | "server" | "demo";

/** Mirrors the creator's storage mode: browser sessions only exist without a database. */
export type AnalyticsStorage = "database" | "browser";

export interface AnalyticsContext {
  storage: AnalyticsStorage;
  /** The creator's quiz store, to simulate the generic demo on the lecturer's own quiz. */
  repository: QuizRepository;
}

export interface AnalyticsSessionOption {
  id: string;
  source: AnalyticsSource;
  roomCode: string;
  /** When the class played it (epoch ms). Null for the undated generic demo. */
  startedAt: number | null;
  participants: number;
  status: SessionStatus;
}

export interface LoadedSessionAnalytics {
  analytics: SessionAnalytics;
  source: AnalyticsSource;
  /** Set when the requested session could not be found and the demo is shown instead. */
  missingId: string | null;
}

function statusOf(state: Pick<EngineState, "phase">): SessionStatus {
  return state.phase === "finished" ? "finished" : state.phase === "ended" ? "ended" : "in_progress";
}

/* ------------------------------------------------------------------ */
/* Demo                                                                */
/* ------------------------------------------------------------------ */

async function demoQuizFor(quizId: string | undefined, repository: QuizRepository | undefined): Promise<Quiz> {
  if (!quizId) return OS_BATTLE;
  const quiz = getSeedQuiz(quizId) ?? (await repository?.get(quizId).catch(() => null));
  return quiz && quiz.questions.length > 0 ? quiz : OS_BATTLE;
}

const demoCache = new Map<string, SessionAnalytics>();

/** The generic demo: every question of the quiz played by the 42 seed students. */
export async function demoAnalytics(quizId?: string, repository?: QuizRepository): Promise<SessionAnalytics> {
  const quiz = await demoQuizFor(quizId, repository);
  const cacheKey = `${quiz.id}@${quiz.updatedAt}`;
  const cached = demoCache.get(cacheKey);
  if (cached) return cached;
  const { engine } = simulateGame({ quiz, playedQuestions: quiz.questions.length, stopAt: "finished" });
  const computed = computeSessionAnalytics(engine.state);
  // The simulation clock is arbitrary; an undated session reads as "simulated class", not as a real date.
  const analytics: SessionAnalytics = { ...computed, session: { ...computed.session, startedAt: null, endedAt: null } };
  demoCache.set(cacheKey, analytics);
  return analytics;
}

function demoHistoryAnalytics(sessionId: string): SessionAnalytics | null {
  const engine = simulateDemoHistorySession(sessionId);
  if (!engine) return null;
  const analytics = computeSessionAnalytics(engine.state);
  // The history list dates demo classes relative to today; show the same dates here.
  const entry = demoHistoryEntries(Date.now()).find((e) => e.id === sessionId);
  if (!entry) return analytics;
  const { startedAt, endedAt } = entry;
  return {
    ...analytics,
    session: { ...analytics.session, startedAt, endedAt, durationMs: Math.max(0, endedAt - startedAt) },
  };
}

/* ------------------------------------------------------------------ */
/* Browser (sessions hosted from this tab)                             */
/* ------------------------------------------------------------------ */

function localEngine(sessionId: string): EngineState | null {
  if (sessionId === DEMO_SESSION_ID) return null;
  const stored = readStoredSession(sessionId);
  return stored?.persisted.engine ?? null;
}

function localOptions(quizId: string): AnalyticsSessionOption[] {
  const options: AnalyticsSessionOption[] = [];
  for (const id of listStoredSessionIds()) {
    if (id === DEMO_SESSION_ID) continue;
    const stored = readStoredSession(id);
    // Solo player demos (a virtual host driving bots) are not the lecturer's classes.
    if (!stored || stored.virtualHost) continue;
    const state = stored.persisted.engine;
    if (state.quiz.id !== quizId || state.startedAt === null) continue;
    options.push({
      id,
      source: "local",
      roomCode: state.roomCode,
      startedAt: state.startedAt,
      participants: Object.values(state.players).filter((p) => !p.kicked).length,
      status: statusOf(state),
    });
  }
  return options;
}

/* ------------------------------------------------------------------ */
/* Game server                                                         */
/* ------------------------------------------------------------------ */

function serverOptions(items: ServerSessionItem[], quizId: string): AnalyticsSessionOption[] {
  return items
    .filter((s) => s.quizId === quizId && s.startedAt !== null && s.id !== DEMO_SESSION_ID)
    .map((s) => ({
      id: s.id,
      source: "server" as const,
      roomCode: s.roomCode,
      startedAt: s.startedAt,
      participants: s.players,
      status: s.status === "finished" ? "finished" : s.status === "ended" ? "ended" : "in_progress",
    }));
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Sessions of one quiz the lecturer can open, newest real class first, then the
 * demo classes. Never empty: the generic demo is always available.
 */
export async function listAnalyticsSessions(
  quizId: string,
  context: AnalyticsContext,
): Promise<AnalyticsSessionOption[]> {
  const real = context.storage === "browser" ? localOptions(quizId) : [];
  // A session list the server cannot give (offline, signed out) must not hide the rest.
  const server = await fetchServerSessions().catch(() => []);
  const known = new Set(real.map((o) => o.id));
  real.push(...serverOptions(server, quizId).filter((o) => !known.has(o.id)));
  real.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));

  const history: AnalyticsSessionOption[] = demoHistoryEntries(Date.now())
    .filter((e) => e.engine.state.quiz.id === quizId)
    .sort((a, b) => b.startedAt - a.startedAt)
    .map((e) => ({
      id: e.id,
      source: "demo",
      roomCode: e.engine.state.roomCode,
      startedAt: e.startedAt,
      participants: Object.keys(e.engine.state.players).length,
      status: "finished",
    }));

  const generic: AnalyticsSessionOption[] = history.length
    ? []
    : [{ id: DEMO_SESSION_ID, source: "demo", roomCode: "", startedAt: null, participants: 42, status: "finished" }];

  return [...real, ...history, ...generic];
}

/** The session shown when the URL names none: the newest real class, else the newest demo class. */
export function defaultSessionId(options: AnalyticsSessionOption[]): string {
  return options[0]?.id ?? DEMO_SESSION_ID;
}

export async function loadSessionAnalytics(
  sessionId: string | null | undefined,
  { quizId, storage, repository }: { quizId?: string } & AnalyticsContext,
): Promise<LoadedSessionAnalytics> {
  if (!sessionId || sessionId === DEMO_SESSION_ID) {
    return { analytics: await demoAnalytics(quizId, repository), source: "demo", missingId: null };
  }

  if (sessionId.startsWith(DEMO_HISTORY_PREFIX)) {
    const analytics = demoHistoryAnalytics(sessionId);
    if (analytics) return { analytics, source: "demo", missingId: null };
  }

  const local = storage === "browser" ? localEngine(sessionId) : null;
  if (local) return { analytics: computeSessionAnalytics(local), source: "local", missingId: null };

  // Unknown to the server (404) falls back to the demo; any other failure is an error to retry.
  const state = await fetchSessionEngineState(sessionId);
  if (state) return { analytics: computeSessionAnalytics(state), source: "server", missingId: null };

  return { analytics: await demoAnalytics(quizId, repository), source: "demo", missingId: sessionId };
}
