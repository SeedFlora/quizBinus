import "server-only";
import { and, eq, inArray, isNull, lt, or, gt, sql } from "drizzle-orm";
import { z } from "zod";
import type { EngineState } from "@/lib/game/engine";
import type { AnswerPayload, GamePhase, Quiz } from "@/lib/game/types";
import type { PersistedAuthority } from "@/lib/realtime/authority";
import { sha256Hex } from "@/lib/security/sha256";
import type { SessionMeta, SessionPersistence, StoredSessionRecord } from "@/lib/server/game-runtime";
import { getDb, type Db } from "./client";
import { describeError, isUuid } from "./errors";
import {
  gameSessions,
  leaderboardSnapshots,
  playerAnswers,
  players,
  quizzes,
  sessionEvents,
  type SessionStatus,
} from "./schema";

/**
 * Write-behind persistence for ServerGameRuntime (database mode).
 *
 *   game_sessions.engine_state   the full PersistedAuthority (engine state + player
 *                                token HASHES) minus engine.quiz, which lives once in
 *                                quiz_snapshot. Enough to restore a running game.
 *   players / player_answers /   normalized copies for reporting, synced idempotently
 *   leaderboard_snapshots        (upserts) whenever a question is revealed or the game ends
 *   session_events               one row per phase change
 *
 * Saves for one session run strictly in order and coalesce: while a write is in
 * flight, newer records replace each other and only the latest is written next.
 * Errors are logged, never thrown into the game loop.
 */

/** The shared classroom demo is rebuilt on demand and never stored. */
export const UNPERSISTED_SESSION_IDS: ReadonlySet<string> = new Set(["demo"]);

const SYNC_PHASES: ReadonlySet<GamePhase> = new Set(["reveal", "leaderboard", "finished", "ended"]);
const LIVE_STATUSES = ["lobby", "running"] as const satisfies readonly SessionStatus[];
/** Rows per multi-row INSERT (Postgres allows 65 535 bind parameters per statement). */
const CHUNK = 500;
const SHA256_HEX = /^[0-9a-f]{64}$/;

export function statusForPhase(phase: GamePhase): SessionStatus {
  switch (phase) {
    case "lobby":
      return "lobby";
    case "finished":
      return "finished";
    case "ended":
      return "ended";
    default:
      return "running";
  }
}

/** Only hashes are ever stored; anything else (a raw token) is hashed first. */
function hashedTokens(tokens: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tokens).map(([id, value]) => [id, SHA256_HEX.test(value) ? value : sha256Hex(value)]),
  );
}

/** single-choice answers also get their option id in a column (quick distribution queries). */
function primaryAnswerId(payload: AnswerPayload): string | null {
  return payload.kind === "choice" && payload.answerIds.length === 1 ? payload.answerIds[0]! : null;
}

function chunks<T>(rows: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

const date = (ms: number | null | undefined): Date | null => (typeof ms === "number" ? new Date(ms) : null);

/* ------------------------------------------------------------------ */
/* Stored shape (validated on load: the column is ours, but a bad row  */
/* must be skipped, not crash the boot)                                */
/* ------------------------------------------------------------------ */

const storedEngineSchema = z.looseObject({
  version: z.literal(1),
  sessionId: z.string(),
  roomCode: z.string(),
  phase: z.string(),
  questionIndex: z.number(),
  players: z.record(z.string(), z.unknown()),
  answers: z.record(z.string(), z.unknown()),
  reveals: z.record(z.string(), z.unknown()),
  expiresAt: z.number(),
});
const storedAuthoritySchema = z.object({
  engine: storedEngineSchema,
  tokens: z.record(z.string(), z.string()),
});
const metaSchema = z.looseObject({
  hostId: z.string(),
  quizId: z.string().nullable(),
  createdAt: z.number(),
});
const quizSnapshotSchema = z.looseObject({ id: z.string(), questions: z.array(z.unknown()) });

/** Rebuilds the engine state (quiz included) from a game_sessions row, or null when malformed. */
export function engineStateFromRow(row: { engineState: unknown; quizSnapshot: unknown }): EngineState | null {
  const persisted = persistedFromRow(row);
  return persisted?.engine ?? null;
}

function persistedFromRow(row: { engineState: unknown; quizSnapshot: unknown }): PersistedAuthority | null {
  const stored = storedAuthoritySchema.safeParse(row.engineState);
  const quiz = quizSnapshotSchema.safeParse(row.quizSnapshot);
  if (!stored.success || !quiz.success) return null;
  return {
    engine: { ...(stored.data.engine as unknown as Omit<EngineState, "quiz">), quiz: quiz.data as unknown as Quiz },
    tokens: stored.data.tokens,
  };
}

/* ------------------------------------------------------------------ */

interface Tracked {
  /** `${phase}:${questionIndex}` of the last successful normalized sync. */
  syncKey: string | null;
  /** Questions whose answers are already in player_answers with their final correctness. */
  syncedQuestions: Set<string>;
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export class PostgresSessionPersistence implements SessionPersistence {
  private readonly latest = new Map<string, StoredSessionRecord>();
  private readonly chains = new Map<string, Promise<void>>();
  private readonly tracked = new Map<string, Tracked>();
  private warnedHosts = new Set<string>();

  constructor(private readonly db: () => Db | null = getDb) {}

  save(record: StoredSessionRecord): Promise<void> {
    const id = record.sessionId;
    if (UNPERSISTED_SESSION_IDS.has(id)) return Promise.resolve();
    this.latest.set(id, record);
    const previous = this.chains.get(id) ?? Promise.resolve();
    const run = previous.then(async () => {
      const next = this.latest.get(id);
      if (!next) return; // an earlier link already wrote the newest record
      this.latest.delete(id);
      try {
        await this.write(next);
      } catch (err) {
        console.error("[db] session save failed", id, describeError(err));
      }
    });
    this.chains.set(id, run);
    void run.then(() => {
      if (this.chains.get(id) === run) this.chains.delete(id);
    });
    return run;
  }

  async loadActive(): Promise<StoredSessionRecord[]> {
    const db = this.db();
    if (!db) return [];
    const now = new Date();
    // Rooms that outlived their PIN are over; release their codes before restoring.
    await db
      .update(gameSessions)
      .set({ status: "ended", endedAt: sql`coalesce(${gameSessions.endedAt}, now())`, updatedAt: now })
      .where(and(inArray(gameSessions.status, LIVE_STATUSES), lt(gameSessions.roomCodeExpiresAt, now)));

    const rows = await db
      .select({
        id: gameSessions.id,
        engineState: gameSessions.engineState,
        quizSnapshot: gameSessions.quizSnapshot,
        meta: gameSessions.meta,
      })
      .from(gameSessions)
      .where(
        and(
          inArray(gameSessions.status, LIVE_STATUSES),
          or(isNull(gameSessions.roomCodeExpiresAt), gt(gameSessions.roomCodeExpiresAt, now)),
        ),
      );

    const records: StoredSessionRecord[] = [];
    for (const row of rows) {
      const persisted = persistedFromRow(row);
      const meta = metaSchema.safeParse(row.meta);
      if (!persisted || !meta.success) {
        console.error("[db] skipping unreadable session", row.id);
        continue;
      }
      records.push({ sessionId: row.id, persisted, meta: meta.data as SessionMeta });
    }
    return records;
  }

  async isRoomCodeTaken(code: string): Promise<boolean> {
    const db = this.db();
    if (!db) return false;
    const now = new Date();
    await db
      .update(gameSessions)
      .set({ status: "ended", endedAt: sql`coalesce(${gameSessions.endedAt}, now())`, updatedAt: now })
      .where(
        and(
          eq(gameSessions.roomCode, code),
          inArray(gameSessions.status, LIVE_STATUSES),
          lt(gameSessions.roomCodeExpiresAt, now),
        ),
      );
    const [row] = await db
      .select({ id: gameSessions.id })
      .from(gameSessions)
      .where(and(eq(gameSessions.roomCode, code), inArray(gameSessions.status, LIVE_STATUSES)))
      .limit(1);
    return Boolean(row);
  }

  /** Resolves once every queued save has been written (tests, graceful shutdown). */
  async flush(): Promise<void> {
    while (this.chains.size) await Promise.all([...this.chains.values()]);
  }

  /* ---------------------------------------------------------------- */

  private async write(record: StoredSessionRecord): Promise<void> {
    const db = this.db();
    if (!db) return;
    const { sessionId, meta } = record;
    if (!isUuid(meta.hostId)) {
      // Only database lecturers own stored sessions (host_id references users).
      if (!this.warnedHosts.has(meta.hostId)) {
        this.warnedHosts.add(meta.hostId);
        console.warn("[db] not persisting session hosted by a non-database lecturer", sessionId);
      }
      return;
    }
    const { quiz, ...engineRest } = record.persisted.engine;
    const engine = record.persisted.engine;
    const status = statusForPhase(engine.phase);
    const engineState = { engine: engineRest, tokens: hashedTokens(record.persisted.tokens) };
    const tracked = this.tracked.get(sessionId) ?? { syncKey: null, syncedQuestions: new Set<string>() };
    const syncKey = `${engine.phase}:${engine.questionIndex}`;
    const shouldSync = SYNC_PHASES.has(engine.phase) && tracked.syncKey !== syncKey;
    let synced: string[] = [];

    await db.transaction(async (tx) => {
      const [previous] = await tx
        .select({ phase: sql<string | null>`${gameSessions.engineState}->'engine'->>'phase'` })
        .from(gameSessions)
        .where(eq(gameSessions.id, sessionId))
        .for("update");

      // quiz_id only when that quiz still exists (it may have been deleted meanwhile).
      const quizId = isUuid(meta.quizId)
        ? sql`(select qz."id" from ${quizzes} qz where qz."id" = ${meta.quizId})`
        : null;
      const changing = {
        status,
        currentQuestion: engine.questionIndex,
        engineState,
        meta,
        roomCodeExpiresAt: new Date(engine.expiresAt),
        startedAt: date(engine.startedAt),
        endedAt: date(engine.endedAt),
      };
      await tx
        .insert(gameSessions)
        .values({
          id: sessionId,
          quizId,
          hostId: meta.hostId,
          roomCode: engine.roomCode,
          quizSnapshot: quiz,
          createdAt: new Date(engine.createdAt),
          ...changing,
        })
        .onConflictDoUpdate({ target: gameSessions.id, set: { ...changing, updatedAt: new Date() } });

      if (!previous || previous.phase !== engine.phase) {
        await tx.insert(sessionEvents).values({
          sessionId,
          type: "phase",
          payload: {
            from: previous?.phase ?? null,
            to: engine.phase,
            questionIndex: engine.questionIndex,
            players: Object.values(engine.players).filter((p) => !p.kicked).length,
          },
        });
      }

      if (shouldSync) synced = await this.syncNormalized(tx, sessionId, engine, tracked.syncedQuestions);
    });

    if (shouldSync) {
      tracked.syncKey = syncKey;
      for (const q of synced) tracked.syncedQuestions.add(q);
    }
    this.tracked.set(sessionId, tracked);
    if (status === "finished" || status === "ended") this.tracked.delete(sessionId);
  }

  /** Idempotent upserts of players, answers and the current leaderboard. Returns newly final questions. */
  private async syncNormalized(
    tx: Tx,
    sessionId: string,
    engine: EngineState,
    alreadySynced: ReadonlySet<string>,
  ): Promise<string[]> {
    const playerRows = Object.values(engine.players).map((p) => ({
      id: p.id,
      sessionId,
      nickname: p.nickname,
      avatarSeed: p.avatarSeed,
      score: p.score,
      streak: p.streak,
      bestStreak: p.bestStreak,
      correctCount: p.correctCount,
      answeredCount: p.answeredCount,
      totalResponseMs: Math.round(p.totalResponseMs),
      isKicked: p.kicked,
      connected: p.connected,
      joinedAt: new Date(p.joinedAt),
    }));
    for (const rows of chunks(playerRows)) {
      await tx
        .insert(players)
        .values(rows)
        .onConflictDoUpdate({
          target: [players.sessionId, players.id],
          set: {
            nickname: sql`excluded.nickname`,
            score: sql`excluded.score`,
            streak: sql`excluded.streak`,
            bestStreak: sql`excluded.best_streak`,
            correctCount: sql`excluded.correct_count`,
            answeredCount: sql`excluded.answered_count`,
            totalResponseMs: sql`excluded.total_response_ms`,
            isKicked: sql`excluded.is_kicked`,
            connected: sql`excluded.connected`,
          },
        });
    }

    // A question's answers are final once revealed; when the game is over, whatever
    // was submitted to an unrevealed question is stored as-is (is_correct null).
    const over = engine.phase === "finished" || engine.phase === "ended";
    const questionIds = Object.keys(engine.answers).filter(
      (qid) => !alreadySynced.has(qid) && (over || engine.reveals[qid] !== undefined),
    );
    const answerRows = questionIds.flatMap((questionId) =>
      Object.values(engine.answers[questionId] ?? {})
        .filter((a) => engine.players[a.playerId] !== undefined)
        .map((a) => ({
          sessionId,
          playerId: a.playerId,
          questionId,
          answerId: primaryAnswerId(a.payload),
          answerPayload: a.payload,
          isCorrect: a.isCorrect ?? null,
          responseTimeMs: Math.round(a.responseTimeMs),
          pointsAwarded: a.pointsAwarded ?? null,
          submittedAt: new Date(a.submittedAt),
        })),
    );
    for (const rows of chunks(answerRows)) {
      await tx
        .insert(playerAnswers)
        .values(rows)
        .onConflictDoUpdate({
          target: [playerAnswers.sessionId, playerAnswers.playerId, playerAnswers.questionId],
          set: {
            answerId: sql`excluded.answer_id`,
            answerPayload: sql`excluded.answer_payload`,
            isCorrect: sql`excluded.is_correct`,
            responseTimeMs: sql`excluded.response_time_ms`,
            pointsAwarded: sql`excluded.points_awarded`,
          },
        });
    }

    if (engine.questionIndex >= 0 && engine.leaderboard.length > 0) {
      await tx
        .insert(leaderboardSnapshots)
        .values({ sessionId, questionIndex: engine.questionIndex, entries: engine.leaderboard })
        .onConflictDoUpdate({
          target: [leaderboardSnapshots.sessionId, leaderboardSnapshots.questionIndex],
          set: { entries: sql`excluded.entries` },
        });
    }
    return questionIds.filter((qid) => engine.reveals[qid] !== undefined);
  }
}

/** The instance the runtime uses (lib/server/bootstrap.ts). */
export const postgresSessionPersistence = new PostgresSessionPersistence();
