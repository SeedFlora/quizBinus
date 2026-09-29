import type { EngineState } from "@/lib/game/engine";
import { isScored } from "@/lib/game/evaluate";
import type { Question, QuestionStats } from "@/lib/game/types";
import { demoHistoryEntries } from "@/lib/demo/history";

/**
 * Session history as the lecturer's desk sees it: one flat record per session,
 * derived from engine state (a session hosted in this browser or on the game
 * server), the server's session list (database mode) or a simulated class (demo).
 */

export type SessionStatus = "lobby" | "live" | "ended";

export interface SessionRecord {
  id: string;
  quizId: string;
  quizTitle: string;
  courseCode: string;
  courseName: string;
  className?: string;
  roomCode: string;
  status: SessionStatus;
  players: number;
  questionsPlayed: number;
  totalQuestions: number;
  /** Correct / answered over scored questions, 0..1. Null before the first scored reveal. */
  accuracy: number | null;
  /** Answers received / (players × scored questions revealed), 0..1. */
  participation: number | null;
  /** Scored answers received and expected, kept so totals can be weighted properly. */
  answered: number;
  expected: number;
  correct: number;
  hardestTopic: { topic: string; accuracy: number } | null;
  startedAt: number;
  endedAt: number | null;
  /** Simulated history shipped with demo mode (never a real class). */
  demo: boolean;
}

/** The parts of a session a summary needs; both engine state and database rows can supply them. */
export interface SessionSummaryInput {
  id: string;
  roomCode: string;
  quiz: {
    id: string;
    title: string;
    course: { courseCode: string; courseName: string; className?: string };
    questions: Array<Pick<Question, "id" | "type" | "points" | "topic" | "prompt">>;
  };
  reveals: Record<string, { stats: Pick<QuestionStats, "answered" | "correct" | "accuracy"> }>;
  players: number;
  status: SessionStatus;
  startedAt: number;
  endedAt: number | null;
  demo: boolean;
}

export function summarizeSession(input: SessionSummaryInput): SessionRecord {
  let answered = 0;
  let correct = 0;
  let expected = 0;
  let hardest: SessionRecord["hardestTopic"] = null;

  for (const question of input.quiz.questions) {
    const reveal = input.reveals[question.id];
    // isScored only reads type and points.
    if (!reveal || !isScored(question as Question)) continue;
    answered += reveal.stats.answered;
    correct += reveal.stats.correct;
    expected += input.players;
    if (reveal.stats.answered > 0 && (!hardest || reveal.stats.accuracy < hardest.accuracy)) {
      hardest = { topic: question.topic ?? question.prompt, accuracy: reveal.stats.accuracy };
    }
  }

  return {
    id: input.id,
    quizId: input.quiz.id,
    quizTitle: input.quiz.title,
    courseCode: input.quiz.course.courseCode,
    courseName: input.quiz.course.courseName,
    className: input.quiz.course.className,
    roomCode: input.roomCode,
    status: input.status,
    players: input.players,
    questionsPlayed: Object.keys(input.reveals).length,
    totalQuestions: input.quiz.questions.length,
    accuracy: answered > 0 ? correct / answered : null,
    participation: expected > 0 ? Math.min(1, answered / expected) : null,
    answered,
    expected,
    correct,
    hardestTopic: hardest,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    demo: input.demo,
  };
}

function statusOf(state: EngineState, now: number): SessionStatus {
  if (state.phase === "finished" || state.phase === "ended" || now > state.expiresAt) return "ended";
  return state.phase === "lobby" ? "lobby" : "live";
}

/** Reduce an engine state (this browser, the game server, demo) to what the history list and dashboard need. */
export function summarizeEngineState(
  state: EngineState,
  options: { now: number; demo?: boolean; startedAt?: number; endedAt?: number | null },
): SessionRecord {
  return summarizeSession({
    id: state.sessionId,
    roomCode: state.roomCode,
    quiz: state.quiz,
    reveals: state.reveals,
    players: Object.values(state.players).filter((p) => !p.kicked).length,
    status: statusOf(state, options.now),
    startedAt: options.startedAt ?? state.startedAt ?? state.createdAt,
    endedAt: options.endedAt !== undefined ? options.endedAt : state.endedAt,
    demo: options.demo ?? false,
  });
}

/* ------------------------------------------------------------------ */
/* Demo history                                                        */
/* ------------------------------------------------------------------ */

/** Demo sessions dated relative to today, so the history always reads as recent. */
export function demoHistory(now: number): SessionRecord[] {
  return demoHistoryEntries(now).map(({ engine, startedAt, endedAt }) =>
    summarizeEngineState(engine.state, { now, demo: true, startedAt, endedAt }),
  );
}
