/**
 * Core game domain types shared by the engine, realtime providers and UI.
 *
 * Two families of shapes exist on purpose:
 * - Authoring shapes (Quiz, Question, AnswerOption) carry `isCorrect` and live only on
 *   the authority (server route / host tab in local mode) and in the creator.
 * - Public shapes (PublicQuestion, PublicAnswer) are what players receive while a
 *   question is open. They never contain correctness data.
 */

export const QUESTION_TYPES = [
  "single",
  "multiple",
  "true_false",
  "short_answer",
  "poll",
  "ordering",
  "numeric",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Designed-for but not yet playable types. Kept here so data models can evolve. */
export const FUTURE_QUESTION_TYPES = ["image_hotspot", "word_cloud", "matching"] as const;
export type FutureQuestionType = (typeof FUTURE_QUESTION_TYPES)[number];

export const TIME_LIMITS = [5, 10, 15, 20, 30, 45, 60, 90, 120] as const;
export type TimeLimit = (typeof TIME_LIMITS)[number];

export const POINT_PRESETS = [0, 500, 1000, 2000] as const;

export const GAME_MODES = ["classic", "team", "mastery", "practice"] as const;
export type GameMode = (typeof GAME_MODES)[number];
/** Only CLASSIC is complete in the MVP; the others are typed but disabled in the UI. */
export const ENABLED_GAME_MODES: readonly GameMode[] = ["classic"];

export const DIFFICULTIES = ["mudah", "sedang", "sulit"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export type AnswerSlot = 0 | 1 | 2 | 3;

export interface AnswerOption {
  id: string;
  position: number;
  text: string;
  isCorrect: boolean;
}

export interface NumericSpec {
  value: number;
  tolerance: number;
  unit?: string;
}

export interface Question {
  id: string;
  position: number;
  type: QuestionType;
  prompt: string;
  description?: string;
  explanation?: string;
  mediaUrl?: string;
  timeLimit: number;
  points: number;
  topic?: string;
  learningOutcome?: string;
  answers: AnswerOption[];
  /** short_answer: accepted strings (normalized match). */
  acceptedAnswers?: string[];
  /** numeric: value and tolerance. */
  numeric?: NumericSpec;
}

export interface CourseInfo {
  courseCode: string;
  courseName: string;
  className?: string;
  lecturer?: string;
  learningOutcome?: string;
}

export interface Quiz {
  id: string;
  ownerId: string;
  title: string;
  description?: string;
  course: CourseInfo;
  topic?: string;
  difficulty: Difficulty;
  language: "id" | "en";
  visibility: "private" | "unlisted" | "public";
  mode: GameMode;
  questions: Question[];
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Public (player-safe) shapes                                         */
/* ------------------------------------------------------------------ */

export interface PublicAnswer {
  id: string;
  position: number;
  text: string;
}

export interface PublicQuestion {
  id: string;
  index: number;
  total: number;
  type: QuestionType;
  prompt: string;
  description?: string;
  mediaUrl?: string;
  timeLimit: number;
  points: number;
  topic?: string;
  answers: PublicAnswer[];
  /** multiple: how many to select (UI hint, does not reveal which). */
  selectCount?: number;
  unit?: string;
}

/** What a player submits. Shape depends on question type. */
export type AnswerPayload =
  | { kind: "choice"; answerIds: string[] }
  | { kind: "text"; value: string }
  | { kind: "number"; value: number }
  | { kind: "order"; answerIds: string[] };

/* ------------------------------------------------------------------ */
/* Session / players                                                   */
/* ------------------------------------------------------------------ */

export const GAME_PHASES = ["lobby", "intro", "question", "reveal", "leaderboard", "finished", "ended"] as const;
export type GamePhase = (typeof GAME_PHASES)[number];

export interface PublicPlayer {
  id: string;
  nickname: string;
  avatarSeed: string;
  teamId?: string;
}

export interface PlayerState extends PublicPlayer {
  score: number;
  streak: number;
  bestStreak: number;
  correctCount: number;
  answeredCount: number;
  totalResponseMs: number;
  joinedAt: number;
  connected: boolean;
  kicked: boolean;
}

export interface AnswerRecord {
  playerId: string;
  questionId: string;
  payload: AnswerPayload;
  submittedAt: number;
  responseTimeMs: number;
  /** Filled at reveal time by the authority. */
  isCorrect?: boolean;
  pointsAwarded?: number;
  streakAfter?: number;
}

export interface LeaderboardEntry {
  playerId: string;
  nickname: string;
  avatarSeed: string;
  score: number;
  rank: number;
  previousRank: number | null;
  streak: number;
  lastPoints: number;
}

export interface AnswerDistribution {
  answerId: string;
  count: number;
}

export interface QuestionStats {
  answered: number;
  correct: number;
  accuracy: number; // 0..1
  averageResponseMs: number;
  fastestPlayer?: { nickname: string; responseTimeMs: number };
}

export interface PlayerQuestionResult {
  playerId: string;
  answered: boolean;
  isCorrect: boolean;
  pointsAwarded: number;
  responseTimeMs: number | null;
  streak: number;
  score: number;
  rank: number;
  previousRank: number | null;
}

export interface QuestionReveal {
  questionId: string;
  correctAnswerIds: string[];
  /** For short_answer / numeric, a human-readable correct answer. */
  correctText?: string;
  explanation?: string;
  distribution: AnswerDistribution[];
  stats: QuestionStats;
  results: Record<string, PlayerQuestionResult>;
}

export interface SessionSnapshot {
  sessionId: string;
  roomCode: string;
  quizTitle: string;
  courseCode: string;
  courseName: string;
  hostName: string;
  phase: GamePhase;
  questionIndex: number;
  totalQuestions: number;
  players: PublicPlayer[];
  answeredCount: number;
  joinsLocked: boolean;
  paused: boolean;
  /** Epoch ms (authority clock) when the open question closes. */
  deadlineAt: number | null;
  /** Remaining ms captured when paused. */
  pausedRemainingMs: number | null;
  showLeaderboard: boolean;
  /** Shown during the intro: index/topic only, never the prompt or answers. */
  upcoming: UpcomingQuestion | null;
  question: PublicQuestion | null;
  reveal: QuestionReveal | null;
  leaderboard: LeaderboardEntry[];
  mode: GameMode;
  /** Authority clock at snapshot time, used by clients to estimate clock offset. */
  serverNow: number;
  endedReason?: EndReason;
  /** Present only in a player's own snapshot. */
  self?: SelfState;
}

export interface UpcomingQuestion {
  index: number;
  total: number;
  topic?: string;
  points: number;
  timeLimit: number;
  isFinal: boolean;
}

export type EndReason = "host_ended" | "expired" | "finished";

export interface SelfState {
  playerId: string;
  nickname: string;
  avatarSeed: string;
  score: number;
  streak: number;
  rank: number | null;
  /** Answer the player already submitted for the current question, if any. */
  currentAnswer: AnswerPayload | null;
  kicked: boolean;
}

export interface PlayerSummary {
  playerId: string;
  nickname: string;
  avatarSeed: string;
  rank: number;
  totalPlayers: number;
  score: number;
  accuracy: number;
  answered: number;
  correct: number;
  averageResponseMs: number | null;
  bestStreak: number;
  strongestTopic: string | null;
  achievements: AchievementId[];
}

export const ACHIEVEMENTS = ["fast", "perfect", "comeback", "streak", "top3", "first", "accuracy"] as const;
export type AchievementId = (typeof ACHIEVEMENTS)[number];

export type SubmitResult =
  | { status: "accepted"; responseTimeMs: number }
  | { status: "duplicate" }
  | { status: "late" }
  | { status: "invalid"; reason: string }
  | { status: "not_open" };
