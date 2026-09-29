/**
 * Sessions on the game server, as the lecturer's desk reads them. Client-only at
 * runtime (same-origin fetch with the lecturer's cookie):
 *
 *   GET /api/sessions               the host's sessions: live ones from the runtime and,
 *                                   in database mode, every stored one
 *   GET /api/sessions/:id/report    one session's full EngineState (live, or from Postgres)
 *
 * Responses are validated here; the rest of the app sees typed values only. The
 * engine state then goes through the same pure computeSessionAnalytics as local and
 * demo sessions.
 */

import { z } from "zod";
import type { EngineState } from "@/lib/game/engine";
import { GAME_PHASES, type AnswerPayload } from "@/lib/game/types";
import { QuizSchema } from "@/lib/quiz/schema";

export type ServerSourceErrorCode = "unauthorized" | "unavailable" | "network";

export class ServerSourceError extends Error {
  constructor(
    readonly code: ServerSourceErrorCode,
    readonly status?: number,
  ) {
    super(code);
    this.name = "ServerSourceError";
  }
}

async function get(path: string): Promise<Response> {
  try {
    return await fetch(path, { credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new ServerSourceError("network");
  }
}

function failure(res: Response): ServerSourceError {
  return new ServerSourceError(res.status === 401 || res.status === 403 ? "unauthorized" : "unavailable", res.status);
}

/* ------------------------------------------------------------------ */
/* Session list                                                        */
/* ------------------------------------------------------------------ */

export type ServerSessionStatus = "lobby" | "live" | "finished" | "ended";

export interface ServerSessionItem {
  id: string;
  /** Null when the quiz was deleted after the session (the report keeps its snapshot). */
  quizId: string | null;
  quizTitle: string;
  courseCode: string;
  roomCode: string;
  status: ServerSessionStatus;
  players: number;
  /** 0..1, null before the first scored reveal. */
  accuracy: number | null;
  startedAt: number | null;
  endedAt: number | null;
  createdAt: number | null;
}

/** Database status column or a live engine phase → one status vocabulary. */
function statusOf(value: string): ServerSessionStatus {
  if (value === "lobby") return "lobby";
  if (value === "finished") return "finished";
  if (value === "ended" || value === "expired") return "ended";
  return "live"; // running, intro, question, reveal, leaderboard
}

/** Epoch ms or an ISO timestamp. */
const Timestamp = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((value) => {
    if (value === null || value === undefined) return null;
    const ms = typeof value === "number" ? value : Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  });

const SessionItemSchema = z.object({
  id: z.string().min(1).max(80),
  quizId: z
    .string()
    .nullish()
    .transform((v) => v || null),
  quizTitle: z
    .string()
    .nullish()
    .transform((v) => v ?? ""),
  courseCode: z
    .string()
    .nullish()
    .transform((v) => v ?? ""),
  roomCode: z
    .string()
    .nullish()
    .transform((v) => v ?? ""),
  status: z.string().transform(statusOf),
  players: z.number().int().min(0).catch(0),
  // A ratio; tolerate a percentage.
  accuracy: z
    .number()
    .min(0)
    .nullish()
    .transform((v) => (v === null || v === undefined ? null : v > 1 ? Math.min(1, v / 100) : v)),
  startedAt: Timestamp,
  endedAt: Timestamp,
  createdAt: Timestamp,
}) satisfies z.ZodType<ServerSessionItem, unknown>;

const SessionListResponse = z.union([
  z.array(z.unknown()),
  z.object({ sessions: z.array(z.unknown()) }).transform((body) => body.sessions),
]);

/** The signed-in host's sessions, newest first. A malformed row is skipped, not fatal. */
export async function fetchServerSessions(): Promise<ServerSessionItem[]> {
  const res = await get("/api/sessions");
  if (!res.ok) throw failure(res);
  const list = SessionListResponse.safeParse(await res.json().catch(() => null));
  if (!list.success) throw new ServerSourceError("unavailable", res.status);
  const items: ServerSessionItem[] = [];
  for (const row of list.data) {
    const item = SessionItemSchema.safeParse(row);
    if (item.success) items.push(item.data);
  }
  const at = (s: ServerSessionItem) => s.startedAt ?? s.createdAt ?? 0;
  return items.sort((a, b) => at(b) - at(a));
}

/* ------------------------------------------------------------------ */
/* Engine state (report)                                               */
/* ------------------------------------------------------------------ */

const AnswerPayloadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("choice"), answerIds: z.array(z.string()) }),
  z.object({ kind: z.literal("text"), value: z.string() }),
  z.object({ kind: z.literal("number"), value: z.number() }),
  z.object({ kind: z.literal("order"), answerIds: z.array(z.string()) }),
]) satisfies z.ZodType<AnswerPayload>;

const PlayerSchema = z.looseObject({
  id: z.string(),
  nickname: z.string(),
  avatarSeed: z.string(),
  score: z.number(),
  streak: z.number(),
  bestStreak: z.number(),
  correctCount: z.number(),
  answeredCount: z.number(),
  totalResponseMs: z.number(),
  joinedAt: z.number(),
  connected: z.boolean(),
  kicked: z.boolean(),
});

const AnswerRecordSchema = z.looseObject({
  playerId: z.string(),
  questionId: z.string(),
  payload: AnswerPayloadSchema,
  submittedAt: z.number(),
  responseTimeMs: z.number(),
  isCorrect: z.boolean().optional(),
  pointsAwarded: z.number().optional(),
});

const RevealSchema = z.looseObject({
  questionId: z.string(),
  correctAnswerIds: z.array(z.string()),
  distribution: z.array(z.unknown()),
  stats: z.looseObject({ answered: z.number(), correct: z.number(), accuracy: z.number() }),
  results: z.record(z.string(), z.unknown()),
});

/**
 * Every field analytics and the session summaries read is checked; the remaining
 * engine fields (timers, leaderboard, …) pass through untouched.
 */
const EngineStateSchema = z.looseObject({
  sessionId: z.string(),
  roomCode: z.string(),
  hostName: z.string(),
  quiz: QuizSchema,
  phase: z.enum(GAME_PHASES),
  questionIndex: z.number().int(),
  players: z.record(z.string(), PlayerSchema),
  answers: z.record(z.string(), z.record(z.string(), AnswerRecordSchema)),
  reveals: z.record(z.string(), RevealSchema),
  skipped: z.array(z.string()),
  createdAt: z.number(),
  startedAt: z.number().nullable(),
  endedAt: z.number().nullable(),
  endedReason: z.enum(["host_ended", "expired", "finished"]).nullable(),
  expiresAt: z.number(),
});

export type ParsedEngineState = { ok: true; state: EngineState } | { ok: false; error: string };

export function parseEngineState(input: unknown): ParsedEngineState {
  const parsed = EngineStateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  // Validated above field by field; what the schema leaves loose is the engine's own output.
  return { ok: true, state: parsed.data as unknown as EngineState };
}

/** The report is the bare EngineState; tolerate it wrapped as `{ state }`. */
function unwrapReport(body: unknown): unknown {
  if (body && typeof body === "object" && !("sessionId" in body) && "state" in body) return body.state;
  return body;
}

/** One session's engine state for its report. Null when the server does not know the session. */
export async function fetchSessionEngineState(sessionId: string): Promise<EngineState | null> {
  const res = await get(`/api/sessions/${encodeURIComponent(sessionId)}/report`);
  if (res.status === 404) return null;
  if (!res.ok) throw failure(res);
  const parsed = parseEngineState(unwrapReport(await res.json().catch(() => null)));
  if (!parsed.ok) {
    console.warn(`[analytics] report for ${sessionId} does not match EngineState\n${parsed.error}`);
    throw new ServerSourceError("unavailable", res.status);
  }
  return parsed.state;
}
