import { z } from "zod";
import type { AnswerPayload } from "@/lib/game/types";
import { ROOM_CODE_PATTERN } from "@/lib/game/room-code";
import { DEMO_SESSION_ID } from "@/lib/demo/simulate";
import { QuizSchema, isPrototypeKey } from "@/lib/quiz/schema";

/**
 * Request schemas for every route handler (app/api/**). Route handlers parse with
 * these before touching the game runtime or the database; nothing from the client is
 * trusted beyond its shape (time, scores and correctness are always computed
 * server-side).
 */

/** Hard cap for a JSON request body. The largest game body (an answer) is < 2 KB. */
export const MAX_BODY_BYTES = 8 * 1024;
/**
 * Cap for bodies that carry a whole quiz (create session in memory mode, quiz CRUD).
 * 100 questions of text are ~200 KB; the rest is headroom for inline data-URL images
 * that browser-stored quizzes use in memory mode.
 */
export const MAX_QUIZ_BODY_BYTES = 6 * 1024 * 1024;

/**
 * Ids inside a quiz snapshot: uuids for authored quizzes, readable slugs for seeds.
 * Never an Object.prototype name: a kick of "__proto__" would otherwise flag the
 * shared prototype of every object in the server as kicked.
 */
export const snapshotIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_.:-]+$/)
  .refine((v) => !isPrototypeKey(v));

/** Engine session ids are uuids; the shared server demo is the literal "demo". */
export const sessionIdSchema = z.union([z.uuid(), z.literal(DEMO_SESSION_ID)]);
/** Players who joined through the API always get a uuid. */
export const playerIdSchema = z.uuid();
/** Any player in a session, including demo bots ("demo-p07"): kick targets. */
export const anyPlayerIdSchema = snapshotIdSchema;
export const roomCodeSchema = z.string().regex(ROOM_CODE_PATTERN);
/** 32 random bytes, base64url (43 chars). A little slack for future token formats. */
export const playerTokenSchema = z
  .string()
  .min(20)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

/** Longest text a short-answer question accepts (mirrors validatePayload in lib/game/evaluate.ts). */
export const MAX_TEXT_ANSWER = 120;
/** No question type has more options than this. */
const MAX_OPTIONS = 12;

export const answerPayloadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("choice"), answerIds: z.array(snapshotIdSchema).min(1).max(MAX_OPTIONS) }),
  z.object({ kind: z.literal("text"), value: z.string().max(MAX_TEXT_ANSWER) }),
  // z.number() rejects NaN and ±Infinity in zod 4.
  z.object({ kind: z.literal("number"), value: z.number() }),
  z.object({ kind: z.literal("order"), answerIds: z.array(snapshotIdSchema).min(1).max(MAX_OPTIONS) }),
]) satisfies z.ZodType<AnswerPayload>;

/* ------------------------------------------------------------------ */
/* Bodies                                                              */
/* ------------------------------------------------------------------ */

/**
 * POST /api/sessions. Database mode loads `quizId` from Postgres; memory mode (quizzes
 * live in the lecturer's browser) needs the quiz inline.
 */
export const createSessionBodySchema = z.object({ quizId: snapshotIdSchema, quiz: QuizSchema.optional() });

export const joinBodySchema = z.object({
  // Sanitized (and length-checked for real) by sanitizeNickname; this only bounds the input.
  nickname: z.string().max(64),
  avatarSeed: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[\p{L}\p{N} _.:-]+$/u),
});

const playerAuth = { playerId: playerIdSchema, token: playerTokenSchema };

export const PLAYER_ACTIONS = ["resume", "leave", "snapshot", "summary"] as const;
export type PlayerAction = (typeof PLAYER_ACTIONS)[number];

export const playerActionBodySchema = z.object({ action: z.enum(PLAYER_ACTIONS), ...playerAuth });

/** POST /api/sessions/[id]/events: player credentials, or an empty body for the host (cookie). */
export const eventsBodySchema = z.union([
  z
    .object(playerAuth)
    .strict()
    .transform((auth) => ({ role: "player" as const, ...auth })),
  z
    .object({})
    .strict()
    .transform(() => ({ role: "host" as const })),
]);

export const answerBodySchema = z.object({
  ...playerAuth,
  questionId: snapshotIdSchema,
  payload: answerPayloadSchema,
});

export const HOST_COMMANDS = [
  "start",
  "publishQuestion",
  "closeQuestion",
  "publishResults",
  "publishLeaderboard",
  "next",
  "finish",
  "pause",
  "resume",
  "skip",
  "end",
  "lock",
  "unlock",
  "showLeaderboard",
  "hideLeaderboard",
  "kick",
] as const;
export type HostCommand = (typeof HOST_COMMANDS)[number];

export const hostCommandBodySchema = z
  .object({ command: z.enum(HOST_COMMANDS), playerId: anyPlayerIdSchema.optional() })
  .refine((body) => body.command !== "kick" || body.playerId !== undefined, {
    message: "kick requires playerId",
    path: ["playerId"],
  });

export type CreateSessionBody = z.infer<typeof createSessionBodySchema>;
export type EventsBody = z.output<typeof eventsBodySchema>;
export type JoinBody = z.infer<typeof joinBodySchema>;
export type PlayerActionBody = z.infer<typeof playerActionBodySchema>;
export type AnswerBody = z.infer<typeof answerBodySchema>;
export type HostCommandBody = z.infer<typeof hostCommandBodySchema>;
