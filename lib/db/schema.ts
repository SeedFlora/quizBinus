/**
 * PostgreSQL schema (Drizzle). The single source of truth for the database:
 * edit this file, run `npx drizzle-kit generate`, commit the SQL in drizzle/
 * (docs/DATABASE.md). The server applies pending migrations on boot.
 *
 * Deliberately plain SQL types (text + check constraints instead of pg enums) so
 * adding a value is a one-line migration and the schema ports to other SQL engines.
 *
 * No "server-only" marker here: drizzle-kit loads this file outside Next.js.
 */

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

export const USER_ROLES = ["admin", "lecturer"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Always stored lowercase (enforced), so lookups are a plain equality. */
    email: text("email").notNull().unique(),
    /** scrypt$N$r$p$salt$hash, see lib/auth/password.ts. */
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    salutation: text("salutation").notNull().default(""),
    role: text("role", { enum: USER_ROLES }).notNull().default("lecturer"),
    locale: text("locale", { enum: ["id", "en"] })
      .notNull()
      .default("id"),
    disabled: boolean("disabled").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => [
    check("users_email_lowercase", sql`${t.email} = lower(${t.email})`),
    check("users_role_check", sql`${t.role} in ('admin', 'lecturer')`),
    check("users_locale_check", sql`${t.locale} in ('id', 'en')`),
  ],
);

/** Lecturer sign-in sessions. Only sha256(cookie token) is stored. */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    userAgent: text("user_agent"),
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId), index("auth_sessions_expires_idx").on(t.expiresAt)],
);

/* ------------------------------------------------------------------ */
/* Authoring: quizzes → questions → answers                            */
/* ------------------------------------------------------------------ */

export const quizzes = pgTable(
  "quizzes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    courseCode: text("course_code"),
    courseName: text("course_name"),
    className: text("class_name"),
    lecturerName: text("lecturer_name"),
    learningOutcome: text("learning_outcome"),
    topic: text("topic"),
    difficulty: text("difficulty").notNull().default("sedang"),
    language: text("language").notNull().default("id"),
    visibility: text("visibility").notNull().default("private"),
    mode: text("mode").notNull().default("classic"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("quizzes_owner_updated_idx").on(t.ownerId, t.updatedAt.desc()),
    check("quizzes_difficulty_check", sql`${t.difficulty} in ('mudah', 'sedang', 'sulit')`),
    check("quizzes_language_check", sql`${t.language} in ('id', 'en')`),
    check("quizzes_visibility_check", sql`${t.visibility} in ('private', 'unlisted', 'public')`),
    check("quizzes_mode_check", sql`${t.mode} in ('classic', 'team', 'mastery', 'practice')`),
  ],
);

/** Type-specific answer data that does not fit the answers table. */
export interface QuestionMetadata {
  /** short_answer: accepted strings (normalized match). */
  acceptedAnswers?: string[];
  /** numeric: value and tolerance. */
  numeric?: { value: number; tolerance: number; unit?: string };
}

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    type: text("type").notNull(),
    prompt: text("prompt").notNull(),
    description: text("description"),
    explanation: text("explanation"),
    mediaUrl: text("media_url"),
    timeLimit: integer("time_limit").notNull(),
    points: integer("points").notNull().default(1000),
    topic: text("topic"),
    learningOutcome: text("learning_outcome"),
    metadata: jsonb("metadata").$type<QuestionMetadata>().notNull().default({}),
  },
  (t) => [
    index("questions_quiz_position_idx").on(t.quizId, t.position),
    check(
      "questions_type_check",
      // Playable types + designed-for types (lib/game/types.ts FUTURE_QUESTION_TYPES).
      sql`${t.type} in ('single', 'multiple', 'true_false', 'short_answer', 'poll', 'ordering', 'numeric', 'image_hotspot', 'word_cloud', 'matching')`,
    ),
    check("questions_time_limit_check", sql`${t.timeLimit} in (5, 10, 15, 20, 30, 45, 60, 90, 120)`),
    check("questions_points_check", sql`${t.points} between 0 and 10000`),
    check("questions_metadata_object", sql`jsonb_typeof(${t.metadata}) = 'object'`),
  ],
);

/** Answer options. `is_correct` never leaves the server before a reveal. */
export const answers = pgTable(
  "answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    text: text("text").notNull(),
    isCorrect: boolean("is_correct").notNull().default(false),
  },
  (t) => [index("answers_question_position_idx").on(t.questionId, t.position)],
);

/* ------------------------------------------------------------------ */
/* Live play (written behind by lib/db/session-persistence.ts)         */
/* ------------------------------------------------------------------ */

export const SESSION_STATUSES = ["lobby", "running", "finished", "ended"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const gameSessions = pgTable(
  "game_sessions",
  {
    /** Engine session id (a uuid; text so the engine owns the format). */
    id: text("id").primaryKey(),
    /** set null: deleting a quiz keeps its session history (quiz_snapshot has everything). */
    quizId: uuid("quiz_id").references(() => quizzes.id, { onDelete: "set null" }),
    hostId: uuid("host_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roomCode: text("room_code").notNull(),
    status: text("status", { enum: SESSION_STATUSES }).notNull().default("lobby"),
    currentQuestion: integer("current_question").notNull().default(-1),
    /** The Quiz (lib/game/types.ts) frozen at creation, INCLUDING correct answers. */
    quizSnapshot: jsonb("quiz_snapshot").notNull(),
    /** PersistedAuthority minus engine.quiz: full engine state + player token HASHES. */
    engineState: jsonb("engine_state").notNull(),
    /** SessionMeta (lib/server/game-runtime.ts): hostId, quizId, bots, createdAt. */
    meta: jsonb("meta").notNull().default({}),
    roomCodeExpiresAt: timestamp("room_code_expires_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("game_sessions_host_created_idx").on(t.hostId, t.createdAt.desc()),
    index("game_sessions_quiz_idx").on(t.quizId),
    // A PIN identifies at most one live room at a time; finished rooms release it.
    uniqueIndex("game_sessions_active_room_code")
      .on(t.roomCode)
      .where(sql`${t.status} in ('lobby', 'running')`),
    check("game_sessions_status_check", sql`${t.status} in ('lobby', 'running', 'finished', 'ended')`),
  ],
);

/**
 * Normalized copies of engine data for reporting, synced on reveal / finish.
 * Primary key is (session_id, id): simulated players reuse fixed ids
 * (lib/seed/players.ts), so a player id is only unique within its session.
 */
export const players = pgTable(
  "players",
  {
    id: text("id").notNull(),
    sessionId: text("session_id")
      .notNull()
      .references(() => gameSessions.id, { onDelete: "cascade" }),
    nickname: text("nickname").notNull(),
    avatarSeed: text("avatar_seed").notNull(),
    score: integer("score").notNull().default(0),
    streak: integer("streak").notNull().default(0),
    bestStreak: integer("best_streak").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    answeredCount: integer("answered_count").notNull().default(0),
    totalResponseMs: bigint("total_response_ms", { mode: "number" }).notNull().default(0),
    isKicked: boolean("is_kicked").notNull().default(false),
    connected: boolean("connected").notNull().default(false),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // The primary key's leading column also serves "players of a session" lookups.
  (t) => [primaryKey({ name: "players_pkey", columns: [t.sessionId, t.id] })],
);

export const playerAnswers = pgTable(
  "player_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: text("session_id")
      .notNull()
      .references(() => gameSessions.id, { onDelete: "cascade" }),
    playerId: text("player_id").notNull(),
    /** Text on purpose: ids inside quiz_snapshot. */
    questionId: text("question_id").notNull(),
    /** The chosen option for single-choice answers; the full answer is in answer_payload. */
    answerId: text("answer_id"),
    answerPayload: jsonb("answer_payload").notNull(),
    /** Null until the question is revealed. */
    isCorrect: boolean("is_correct"),
    responseTimeMs: integer("response_time_ms"),
    pointsAwarded: integer("points_awarded"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "player_answers_player_fk",
      columns: [t.sessionId, t.playerId],
      foreignColumns: [players.sessionId, players.id],
    }).onDelete("cascade"),
    unique("player_answers_one_per_question").on(t.sessionId, t.playerId, t.questionId),
    index("player_answers_session_question_idx").on(t.sessionId, t.questionId),
  ],
);

export const leaderboardSnapshots = pgTable(
  "leaderboard_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: text("session_id")
      .notNull()
      .references(() => gameSessions.id, { onDelete: "cascade" }),
    questionIndex: integer("question_index").notNull(),
    entries: jsonb("entries").notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("leaderboard_snapshots_session_question").on(t.sessionId, t.questionIndex)],
);

/** Append-only timeline (phase changes) for audits and analytics. */
export const sessionEvents = pgTable(
  "session_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    sessionId: text("session_id")
      .notNull()
      .references(() => gameSessions.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("session_events_session_created_idx").on(t.sessionId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Media (files live on the UPLOAD_DIR volume)                         */
/* ------------------------------------------------------------------ */

export const media = pgTable("media", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull().unique(),
  mime: text("mime").notNull(),
  bytes: integer("bytes").notNull(),
  createdAt: createdAt(),
});
