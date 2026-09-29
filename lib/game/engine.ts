/**
 * GameEngine: the single source of truth for one live session.
 *
 * It is transport-agnostic and deterministic (time is always passed in), so the same
 * code runs:
 *   - on the server (ServerGameRuntime; one in-memory engine per live session),
 *   - inside the host tab (local mode over BroadcastChannel),
 *   - in unit tests.
 *
 * Nothing that leaves the engine through `snapshotFor()` contains correctness data
 * for an open question.
 */

import { calculateScore } from "./scoring";
import {
  correctAnswerIds,
  correctAnswerText,
  evaluateAnswer,
  isScored,
  toPublicQuestion,
  validatePayload,
} from "./evaluate";
import type {
  AchievementId,
  AnswerPayload,
  AnswerRecord,
  EndReason,
  GamePhase,
  LeaderboardEntry,
  PlayerQuestionResult,
  PlayerState,
  PlayerSummary,
  PublicPlayer,
  Question,
  QuestionReveal,
  Quiz,
  SessionSnapshot,
  SubmitResult,
} from "./types";
import { nicknameKey } from "@/lib/validation/nickname";

export const DEFAULT_MAX_PLAYERS = 300;
/** Network grace: an answer stamped slightly after the deadline still counts. */
export const DEFAULT_GRACE_MS = 750;

export interface EngineState {
  version: 1;
  sessionId: string;
  roomCode: string;
  hostName: string;
  quiz: Quiz;
  phase: GamePhase;
  questionIndex: number;
  players: Record<string, PlayerState>;
  /** questionId → playerId → record */
  answers: Record<string, Record<string, AnswerRecord>>;
  reveals: Record<string, QuestionReveal>;
  skipped: string[];
  questionOpenedAt: number | null;
  deadlineAt: number | null;
  paused: boolean;
  pausedAt: number | null;
  pausedRemainingMs: number | null;
  joinsLocked: boolean;
  showLeaderboard: boolean;
  leaderboard: LeaderboardEntry[];
  /** Largest single-question rank climb per player (for the Comeback achievement). */
  bestClimb: Record<string, number>;
  maxPlayers: number;
  graceMs: number;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  endedReason: EndReason | null;
  expiresAt: number;
  /**
   * Secret seed of the ordering shuffle (toPublicQuestion). Never part of a snapshot:
   * players know the session id, so it cannot be the seed. Absent in states saved
   * before it existed; those keep shuffling by session id.
   */
  shuffleSeed?: string;
}

export interface CreateEngineInput {
  sessionId: string;
  roomCode: string;
  hostName: string;
  quiz: Quiz;
  now: number;
  maxPlayers?: number;
  graceMs?: number;
  ttlMs?: number;
  /** Tests only; a random 128-bit seed otherwise. */
  shuffleSeed?: string;
}

function randomSeed(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type JoinError = "not_found" | "ended" | "locked" | "full" | "nickname_taken" | "kicked";
export type JoinOutcome = { ok: true; player: PlayerState; rejoined: boolean } | { ok: false; error: JoinError };

export type TransitionError = "invalid_phase" | "no_questions" | "not_found";
export type TransitionResult = { ok: true } | { ok: false; error: TransitionError };

const ok: TransitionResult = { ok: true };
const invalid: TransitionResult = { ok: false, error: "invalid_phase" };

export class GameEngine {
  constructor(public state: EngineState) {}

  static create(input: CreateEngineInput): GameEngine {
    return new GameEngine({
      version: 1,
      sessionId: input.sessionId,
      roomCode: input.roomCode,
      hostName: input.hostName,
      quiz: input.quiz,
      phase: "lobby",
      questionIndex: -1,
      players: {},
      answers: {},
      reveals: {},
      skipped: [],
      questionOpenedAt: null,
      deadlineAt: null,
      paused: false,
      pausedAt: null,
      pausedRemainingMs: null,
      joinsLocked: false,
      showLeaderboard: true,
      leaderboard: [],
      bestClimb: {},
      maxPlayers: input.maxPlayers ?? DEFAULT_MAX_PLAYERS,
      graceMs: input.graceMs ?? DEFAULT_GRACE_MS,
      createdAt: input.now,
      startedAt: null,
      endedAt: null,
      endedReason: null,
      expiresAt: input.now + (input.ttlMs ?? 4 * 60 * 60 * 1000),
      shuffleSeed: input.shuffleSeed ?? randomSeed(),
    });
  }

  static restore(state: EngineState): GameEngine {
    return new GameEngine(structuredClone(state));
  }

  serialize(): EngineState {
    return structuredClone(this.state);
  }

  /* ---------------------------------------------------------------- */
  /* Derived                                                           */
  /* ---------------------------------------------------------------- */

  get questions(): Question[] {
    return this.state.quiz.questions;
  }

  get currentQuestion(): Question | null {
    return this.questions[this.state.questionIndex] ?? null;
  }

  get isLastQuestion(): boolean {
    return this.state.questionIndex >= this.questions.length - 1;
  }

  activePlayers(): PlayerState[] {
    return Object.values(this.state.players).filter((p) => !p.kicked);
  }

  publicPlayers(): PublicPlayer[] {
    return this.activePlayers()
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map(({ id, nickname, avatarSeed, teamId }) => ({ id, nickname, avatarSeed, teamId }));
  }

  answeredCount(): number {
    const q = this.currentQuestion;
    if (!q) return 0;
    const bucket = this.state.answers[q.id] ?? {};
    return Object.keys(bucket).filter((pid) => this.state.players[pid] && !this.state.players[pid]!.kicked).length;
  }

  /** True when every connected, non-kicked player has answered. */
  everyoneAnswered(): boolean {
    const q = this.currentQuestion;
    if (!q) return false;
    const bucket = this.state.answers[q.id] ?? {};
    const expected = this.activePlayers().filter((p) => p.connected);
    return expected.length > 0 && expected.every((p) => bucket[p.id]);
  }

  isExpired(now: number): boolean {
    return now > this.state.expiresAt;
  }

  /* ---------------------------------------------------------------- */
  /* Players                                                           */
  /* ---------------------------------------------------------------- */

  /** The player with this id. Own entries only: "__proto__" must never reach Object.prototype. */
  private playerById(playerId: string): PlayerState | undefined {
    return Object.hasOwn(this.state.players, playerId) ? this.state.players[playerId] : undefined;
  }

  addPlayer(input: { id: string; nickname: string; avatarSeed: string; teamId?: string }, now: number): JoinOutcome {
    const s = this.state;
    const existing = this.playerById(input.id);
    if (existing) {
      if (existing.kicked) return { ok: false, error: "kicked" };
      existing.connected = true;
      return { ok: true, player: existing, rejoined: true };
    }
    if (s.phase === "finished" || s.phase === "ended" || this.isExpired(now)) return { ok: false, error: "ended" };
    if (s.joinsLocked) return { ok: false, error: "locked" };
    if (this.activePlayers().length >= s.maxPlayers) return { ok: false, error: "full" };
    const key = nicknameKey(input.nickname);
    if (this.activePlayers().some((p) => nicknameKey(p.nickname) === key)) {
      return { ok: false, error: "nickname_taken" };
    }
    const player: PlayerState = {
      id: input.id,
      nickname: input.nickname,
      avatarSeed: input.avatarSeed,
      teamId: input.teamId,
      score: 0,
      streak: 0,
      bestStreak: 0,
      correctCount: 0,
      answeredCount: 0,
      totalResponseMs: 0,
      joinedAt: now,
      connected: true,
      kicked: false,
    };
    s.players[player.id] = player;
    return { ok: true, player, rejoined: false };
  }

  setConnected(playerId: string, connected: boolean) {
    const p = this.playerById(playerId);
    if (p) p.connected = connected;
  }

  /** Voluntary leave. In the lobby the seat is freed; mid-game the score is kept. */
  removePlayer(playerId: string) {
    const s = this.state;
    const p = this.playerById(playerId);
    if (!p) return;
    if (s.phase === "lobby") delete s.players[playerId];
    else p.connected = false;
  }

  kickPlayer(playerId: string): boolean {
    const p = this.playerById(playerId);
    if (!p) return false;
    p.kicked = true;
    p.connected = false;
    this.state.leaderboard = this.state.leaderboard.filter((e) => e.playerId !== playerId);
    return true;
  }

  setJoinsLocked(locked: boolean) {
    this.state.joinsLocked = locked;
  }

  setShowLeaderboard(show: boolean) {
    this.state.showLeaderboard = show;
  }

  /* ---------------------------------------------------------------- */
  /* Flow                                                              */
  /* ---------------------------------------------------------------- */

  /** lobby → intro(0) */
  start(now: number): TransitionResult {
    const s = this.state;
    if (s.phase !== "lobby") return invalid;
    if (this.questions.length === 0) return { ok: false, error: "no_questions" };
    s.startedAt = now;
    s.questionIndex = 0;
    s.phase = "intro";
    return ok;
  }

  /** intro → question (answers open, deadline set) */
  openQuestion(now: number): TransitionResult {
    const s = this.state;
    const q = this.currentQuestion;
    if (s.phase !== "intro" || !q) return invalid;
    s.phase = "question";
    s.questionOpenedAt = now;
    s.deadlineAt = now + q.timeLimit * 1000;
    s.paused = false;
    s.pausedAt = null;
    s.pausedRemainingMs = null;
    s.answers[q.id] ??= {};
    return ok;
  }

  submitAnswer(playerId: string, questionId: string, payload: AnswerPayload, now: number): SubmitResult {
    const s = this.state;
    const q = this.currentQuestion;
    const player = this.playerById(playerId);
    if (!player || player.kicked) return { status: "invalid", reason: "unknown_player" };
    if (s.phase !== "question" || !q || q.id !== questionId || s.paused) return { status: "not_open" };
    const bucket = (s.answers[q.id] ??= {});
    if (bucket[playerId]) return { status: "duplicate" };
    if (s.deadlineAt !== null && now > s.deadlineAt + s.graceMs) return { status: "late" };
    const problem = validatePayload(q, payload);
    if (problem) return { status: "invalid", reason: problem };

    const opened = s.questionOpenedAt ?? now;
    const responseTimeMs = Math.max(0, Math.min(now - opened, q.timeLimit * 1000));
    bucket[playerId] = { playerId, questionId, payload, submittedAt: now, responseTimeMs };
    player.connected = true;
    return { status: "accepted", responseTimeMs };
  }

  pause(now: number): TransitionResult {
    const s = this.state;
    if (s.phase !== "question" || s.paused || s.deadlineAt === null) return invalid;
    s.paused = true;
    s.pausedAt = now;
    s.pausedRemainingMs = Math.max(0, s.deadlineAt - now);
    s.deadlineAt = null;
    return ok;
  }

  resume(now: number): TransitionResult {
    const s = this.state;
    if (s.phase !== "question" || !s.paused) return invalid;
    const pausedFor = now - (s.pausedAt ?? now);
    // Shift the open time so response times exclude the pause.
    if (s.questionOpenedAt !== null) s.questionOpenedAt += pausedFor;
    s.deadlineAt = now + (s.pausedRemainingMs ?? 0);
    s.paused = false;
    s.pausedAt = null;
    s.pausedRemainingMs = null;
    return ok;
  }

  /** question → reveal. Scores every player (non-answers break streaks). */
  closeQuestion(now: number): TransitionResult {
    const s = this.state;
    const q = this.currentQuestion;
    if (s.phase !== "question" || !q) return invalid;
    void now;
    s.paused = false;
    s.pausedAt = null;
    s.pausedRemainingMs = null;
    s.deadlineAt = null;

    const previousRanks = new Map(s.leaderboard.map((e) => [e.playerId, e.rank] as const));
    const bucket = s.answers[q.id] ?? {};
    const scored = isScored(q);
    const lastPoints = new Map<string, number>();

    for (const player of this.activePlayers()) {
      const record = bucket[player.id];
      if (!record) {
        if (scored) player.streak = 0;
        lastPoints.set(player.id, 0);
        continue;
      }
      const evaluation = evaluateAnswer(q, record.payload);
      const breakdown = calculateScore({
        isCorrect: evaluation.isCorrect,
        credit: evaluation.credit,
        responseTimeMs: record.responseTimeMs,
        timeLimitMs: q.timeLimit * 1000,
        questionPoints: scored ? q.points : 0,
        streakBefore: player.streak,
        mode: s.quiz.mode,
      });
      record.isCorrect = evaluation.isCorrect;
      record.pointsAwarded = breakdown.total;
      record.streakAfter = breakdown.streakAfter;

      player.score += breakdown.total;
      player.streak = breakdown.streakAfter;
      player.bestStreak = Math.max(player.bestStreak, player.streak);
      if (q.type !== "poll") {
        player.answeredCount += 1;
        if (evaluation.isCorrect) {
          player.correctCount += 1;
          player.totalResponseMs += record.responseTimeMs;
        }
      }
      lastPoints.set(player.id, breakdown.total);
    }

    s.leaderboard = this.computeLeaderboard(previousRanks, lastPoints);
    for (const entry of s.leaderboard) {
      if (entry.previousRank !== null) {
        const climb = entry.previousRank - entry.rank;
        s.bestClimb[entry.playerId] = Math.max(s.bestClimb[entry.playerId] ?? 0, climb);
      }
    }
    s.reveals[q.id] = this.buildReveal(q);
    s.phase = "reveal";
    return ok;
  }

  /** reveal → leaderboard */
  showLeaderboardPhase(): TransitionResult {
    if (this.state.phase !== "reveal") return invalid;
    this.state.phase = "leaderboard";
    return ok;
  }

  /** reveal | leaderboard → intro(next) or finished. */
  next(now: number): TransitionResult {
    const s = this.state;
    if (s.phase !== "reveal" && s.phase !== "leaderboard") return invalid;
    return this.advance(now);
  }

  /** intro | question → skip without scoring. */
  skip(now: number): TransitionResult {
    const s = this.state;
    const q = this.currentQuestion;
    if ((s.phase !== "intro" && s.phase !== "question") || !q) return invalid;
    s.skipped.push(q.id);
    delete s.answers[q.id];
    s.deadlineAt = null;
    s.paused = false;
    s.pausedAt = null;
    s.pausedRemainingMs = null;
    return this.advance(now);
  }

  finish(now: number): TransitionResult {
    const s = this.state;
    if (s.phase === "finished" || s.phase === "ended") return invalid;
    s.phase = "finished";
    s.endedAt = now;
    s.endedReason = "finished";
    s.deadlineAt = null;
    if (s.leaderboard.length === 0) s.leaderboard = this.computeLeaderboard(new Map(), new Map());
    return ok;
  }

  /** Host ends early (after confirmation) or the room expired. */
  end(now: number, reason: EndReason = "host_ended"): TransitionResult {
    const s = this.state;
    if (s.phase === "ended") return invalid;
    s.phase = "ended";
    s.endedAt = now;
    s.endedReason = reason;
    s.deadlineAt = null;
    s.paused = false;
    if (s.leaderboard.length === 0) s.leaderboard = this.computeLeaderboard(new Map(), new Map());
    return ok;
  }

  private advance(now: number): TransitionResult {
    const s = this.state;
    s.questionOpenedAt = null;
    s.deadlineAt = null;
    if (this.isLastQuestion) return this.finish(now);
    s.questionIndex += 1;
    s.phase = "intro";
    return ok;
  }

  /* ---------------------------------------------------------------- */
  /* Results                                                           */
  /* ---------------------------------------------------------------- */

  private computeLeaderboard(previousRanks: Map<string, number>, lastPoints: Map<string, number>): LeaderboardEntry[] {
    const players = this.activePlayers().sort(
      (a, b) =>
        b.score - a.score ||
        // tiebreak: faster total time on correct answers, then earlier join
        a.totalResponseMs - b.totalResponseMs ||
        a.joinedAt - b.joinedAt,
    );
    return players.map((p, i) => ({
      playerId: p.id,
      nickname: p.nickname,
      avatarSeed: p.avatarSeed,
      score: p.score,
      rank: i + 1,
      previousRank: previousRanks.get(p.id) ?? null,
      streak: p.streak,
      lastPoints: lastPoints.get(p.id) ?? 0,
    }));
  }

  private buildReveal(q: Question): QuestionReveal {
    const s = this.state;
    const bucket = s.answers[q.id] ?? {};
    const records = Object.values(bucket).filter((r) => s.players[r.playerId] && !s.players[r.playerId]!.kicked);

    const counts = new Map<string, number>(q.answers.map((a) => [a.id, 0]));
    if (q.type !== "ordering") {
      for (const r of records) {
        if (r.payload.kind === "choice") {
          for (const id of r.payload.answerIds) counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      }
    }
    const correct = records.filter((r) => r.isCorrect);
    const fastest = [...correct].sort((a, b) => a.responseTimeMs - b.responseTimeMs)[0];
    const rankOf = new Map(s.leaderboard.map((e) => [e.playerId, e] as const));

    const results: Record<string, PlayerQuestionResult> = {};
    for (const p of this.activePlayers()) {
      const r = bucket[p.id];
      const entry = rankOf.get(p.id);
      results[p.id] = {
        playerId: p.id,
        answered: Boolean(r),
        isCorrect: Boolean(r?.isCorrect),
        pointsAwarded: r?.pointsAwarded ?? 0,
        responseTimeMs: r?.responseTimeMs ?? null,
        streak: p.streak,
        score: p.score,
        rank: entry?.rank ?? 0,
        previousRank: entry?.previousRank ?? null,
      };
    }

    return {
      questionId: q.id,
      correctAnswerIds: q.type === "poll" ? [] : correctAnswerIds(q),
      correctText: correctAnswerText(q),
      explanation: q.explanation,
      distribution: [...counts].map(([answerId, count]) => ({ answerId, count })),
      stats: {
        answered: records.length,
        correct: correct.length,
        accuracy: records.length ? correct.length / records.length : 0,
        averageResponseMs: records.length
          ? Math.round(records.reduce((sum, r) => sum + r.responseTimeMs, 0) / records.length)
          : 0,
        fastestPlayer: fastest
          ? { nickname: s.players[fastest.playerId]!.nickname, responseTimeMs: fastest.responseTimeMs }
          : undefined,
      },
      results,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Views                                                             */
  /* ---------------------------------------------------------------- */

  /**
   * Public snapshot. `playerId` adds that player's private `self` block.
   * The open question is always sanitized; reveals appear only after closing.
   */
  snapshotFor(now: number, playerId?: string): SessionSnapshot {
    const s = this.state;
    const q = this.currentQuestion;
    const total = this.questions.length;
    const showQuestion = q && (s.phase === "question" || s.phase === "reveal" || s.phase === "leaderboard");
    const reveal = q && (s.phase === "reveal" || s.phase === "leaderboard") ? (s.reveals[q.id] ?? null) : null;

    const snapshot: SessionSnapshot = {
      sessionId: s.sessionId,
      roomCode: s.roomCode,
      quizTitle: s.quiz.title,
      courseCode: s.quiz.course.courseCode,
      courseName: s.quiz.course.courseName,
      hostName: s.hostName,
      phase: s.phase,
      questionIndex: s.questionIndex,
      totalQuestions: total,
      players: this.publicPlayers(),
      answeredCount: this.answeredCount(),
      joinsLocked: s.joinsLocked,
      paused: s.paused,
      deadlineAt: s.deadlineAt,
      pausedRemainingMs: s.pausedRemainingMs,
      showLeaderboard: s.showLeaderboard,
      upcoming:
        q && s.phase === "intro"
          ? {
              index: s.questionIndex,
              total,
              topic: q.topic,
              points: q.points,
              timeLimit: q.timeLimit,
              isFinal: this.isLastQuestion,
            }
          : null,
      question: showQuestion ? toPublicQuestion(q, s.questionIndex, total, s.shuffleSeed ?? s.sessionId) : null,
      reveal,
      leaderboard: s.leaderboard,
      mode: s.quiz.mode,
      serverNow: now,
      endedReason: s.endedReason ?? undefined,
    };

    if (playerId) {
      const p = s.players[playerId];
      if (p) {
        const entry = s.leaderboard.find((e) => e.playerId === playerId);
        snapshot.self = {
          playerId: p.id,
          nickname: p.nickname,
          avatarSeed: p.avatarSeed,
          score: p.score,
          streak: p.streak,
          rank: entry?.rank ?? null,
          currentAnswer: q ? (s.answers[q.id]?.[playerId]?.payload ?? null) : null,
          kicked: p.kicked,
        };
      }
    }
    return snapshot;
  }

  summaryFor(playerId: string): PlayerSummary | null {
    const s = this.state;
    const p = s.players[playerId];
    if (!p) return null;
    const entry = s.leaderboard.find((e) => e.playerId === playerId);
    const records = this.questions
      .filter((q) => q.type !== "poll" && !s.skipped.includes(q.id) && s.reveals[q.id])
      .map((q) => ({ q, r: s.answers[q.id]?.[playerId] }));
    const answered = records.filter((x) => x.r);
    const correct = answered.filter((x) => x.r!.isCorrect);

    const topicStats = new Map<string, { correct: number; total: number }>();
    for (const { q, r } of records) {
      const topic = q.topic ?? "Umum";
      const t = topicStats.get(topic) ?? { correct: 0, total: 0 };
      t.total += 1;
      if (r?.isCorrect) t.correct += 1;
      topicStats.set(topic, t);
    }
    const strongest = [...topicStats]
      .filter(([, t]) => t.correct > 0)
      .sort((a, b) => b[1].correct / b[1].total - a[1].correct / a[1].total || b[1].correct - a[1].correct)[0];

    const summary: PlayerSummary = {
      playerId,
      nickname: p.nickname,
      avatarSeed: p.avatarSeed,
      rank: entry?.rank ?? this.activePlayers().length,
      totalPlayers: this.activePlayers().length,
      score: p.score,
      accuracy: records.length ? correct.length / records.length : 0,
      answered: answered.length,
      correct: correct.length,
      averageResponseMs: answered.length
        ? Math.round(answered.reduce((sum, x) => sum + x.r!.responseTimeMs, 0) / answered.length)
        : null,
      bestStreak: p.bestStreak,
      strongestTopic: strongest?.[0] ?? null,
      achievements: [],
    };
    summary.achievements = computeAchievements(summary, {
      fastestCorrectMs: correct.length ? Math.min(...correct.map((x) => x.r!.responseTimeMs)) : null,
      bestClimb: s.bestClimb[playerId] ?? 0,
      scoredQuestions: records.length,
    });
    return summary;
  }
}

export function computeAchievements(
  summary: Pick<PlayerSummary, "rank" | "accuracy" | "correct" | "bestStreak">,
  extra: { fastestCorrectMs: number | null; bestClimb: number; scoredQuestions: number },
): AchievementId[] {
  const earned: AchievementId[] = [];
  if (extra.fastestCorrectMs !== null && extra.fastestCorrectMs <= 2000) earned.push("fast");
  if (extra.scoredQuestions > 0 && summary.correct === extra.scoredQuestions) earned.push("perfect");
  if (extra.bestClimb >= 5) earned.push("comeback");
  if (summary.bestStreak >= 5) earned.push("streak");
  if (summary.rank === 1) earned.push("first");
  if (summary.rank <= 3) earned.push("top3");
  if (extra.scoredQuestions > 0 && summary.accuracy >= 0.9) earned.push("accuracy");
  return earned;
}
