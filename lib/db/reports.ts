import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import type { EngineState } from "@/lib/game/engine";
import { requireDb } from "./client";
import { isUuid } from "./errors";
import { engineStateFromRow } from "./session-persistence";
import { gameSessions, type SessionStatus } from "./schema";

/**
 * Read side for the lecturer's session history and analytics (database mode).
 * Everything is scoped to the host: a lecturer only ever sees their own sessions.
 */

export interface SessionListItem {
  id: string;
  quizId: string | null;
  quizTitle: string;
  courseCode: string;
  roomCode: string;
  status: SessionStatus;
  /** Players who joined and were not removed by the host. */
  players: number;
  /** Correct / answered over revealed, scored questions (polls and 0-point questions excluded), 0..1. */
  accuracy: number | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

const HISTORY_LIMIT = 200;

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

/**
 * The host's sessions, newest first. Counts and accuracy are computed inside
 * Postgres from the stored engine state, so only a few numbers per row travel.
 */
export async function listHostSessions(hostId: string, limit = HISTORY_LIMIT): Promise<SessionListItem[]> {
  if (!isUuid(hostId)) return [];
  const engine = sql`${gameSessions.engineState}->'engine'`;
  const playerCount = sql<number>`(
    select count(*)::int from jsonb_each(${engine}->'players') p
    where coalesce((p.value->>'kicked')::boolean, false) = false
  )`;
  // Same rule as lib/game/evaluate.ts isScored(): not a poll and worth points.
  const scoredStats = sql`(
    select jsonb_build_object(
      'answered', coalesce(sum((r.value->'stats'->>'answered')::int), 0),
      'correct', coalesce(sum((r.value->'stats'->>'correct')::int), 0)
    )
    from jsonb_each(${engine}->'reveals') r
    join jsonb_array_elements(${gameSessions.quizSnapshot}->'questions') q on q->>'id' = r.key
    where q->>'type' <> 'poll' and coalesce((q->>'points')::int, 0) > 0
  )`;
  const rows = await requireDb()
    .select({
      id: gameSessions.id,
      quizId: gameSessions.quizId,
      quizTitle: sql<string | null>`${gameSessions.quizSnapshot}->>'title'`,
      courseCode: sql<string | null>`${gameSessions.quizSnapshot}->'course'->>'courseCode'`,
      roomCode: gameSessions.roomCode,
      status: gameSessions.status,
      players: playerCount,
      scored: sql<{ answered: number; correct: number } | null>`${scoredStats}`,
      startedAt: gameSessions.startedAt,
      endedAt: gameSessions.endedAt,
      createdAt: gameSessions.createdAt,
    })
    .from(gameSessions)
    .where(eq(gameSessions.hostId, hostId))
    .orderBy(desc(gameSessions.createdAt))
    .limit(limit);

  return rows.map((row) => {
    const answered = Number(row.scored?.answered ?? 0);
    const correct = Number(row.scored?.correct ?? 0);
    return {
      id: row.id,
      quizId: row.quizId,
      quizTitle: row.quizTitle ?? "",
      courseCode: row.courseCode ?? "",
      roomCode: row.roomCode,
      status: row.status,
      players: Number(row.players),
      accuracy: answered > 0 ? correct / answered : null,
      startedAt: iso(row.startedAt),
      endedAt: iso(row.endedAt),
      createdAt: row.createdAt.toISOString(),
    };
  });
}

/** Full engine state (quiz, players, answers, reveals) of one of the host's sessions. */
export async function getSessionEngineState(sessionId: string, hostId: string): Promise<EngineState | null> {
  if (!isUuid(hostId) || !sessionId) return null;
  const [row] = await requireDb()
    .select({ engineState: gameSessions.engineState, quizSnapshot: gameSessions.quizSnapshot })
    .from(gameSessions)
    .where(and(eq(gameSessions.id, sessionId), eq(gameSessions.hostId, hostId)))
    .limit(1);
  return row ? engineStateFromRow(row) : null;
}
