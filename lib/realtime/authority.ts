/**
 * GameAuthority wraps a GameEngine with the things a live session needs around it:
 * wall-clock timers (auto-close at the deadline, auto-close when everyone has
 * answered), player tokens, and event fan-out.
 *
 * The same class runs in the server process (ServerGameRuntime, one per live session)
 * and in a browser tab (LocalRuntime, offline demo). Only sha256 hashes of player
 * tokens are kept, so persisted state never contains a usable credential.
 */

import { GameEngine, type EngineState } from "@/lib/game/engine";
import type { AnswerPayload, SessionSnapshot, SubmitResult } from "@/lib/game/types";
import { sanitizeNickname } from "@/lib/validation/nickname";
import { constantTimeEqual, sha256Hex } from "@/lib/security/sha256";
import type { GameEvent, HostCommandResult, JoinResult, PlayerCredentials, ResumeResult, RoomLookup } from "./types";
import { randomId, randomToken } from "./ids";

export interface AuthorityOptions {
  now?: () => number;
  /** Close the question shortly after every connected player has answered. */
  autoCloseWhenAllAnswered?: boolean;
  onEvent: (event: GameEvent) => void;
  /** Called after every state change (persist). */
  onChange?: (state: PersistedAuthority) => void;
}

export interface PersistedAuthority {
  engine: EngineState;
  /** playerId → sha256(token). The raw token only ever exists on the player's device. */
  tokens: Record<string, string>;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

export class GameAuthority {
  readonly engine: GameEngine;
  private tokens: Record<string, string>;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private allAnsweredTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly now: () => number;

  constructor(
    persisted: PersistedAuthority,
    private readonly options: AuthorityOptions,
  ) {
    this.engine = GameEngine.restore(persisted.engine);
    // Sessions saved before tokens were hashed carried raw tokens (never 64 hex chars).
    this.tokens = Object.fromEntries(
      Object.entries(persisted.tokens).map(([id, value]) => [id, SHA256_HEX.test(value) ? value : sha256Hex(value)]),
    );
    this.now = options.now ?? (() => Date.now());
    this.armTimer();
  }

  get sessionId() {
    return this.engine.state.sessionId;
  }

  get roomCode() {
    return this.engine.state.roomCode;
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    if (this.allAnsweredTimer) clearTimeout(this.allAnsweredTimer);
    this.timer = null;
    this.allAnsweredTimer = null;
  }

  persisted(): PersistedAuthority {
    return { engine: this.engine.serialize(), tokens: { ...this.tokens } };
  }

  snapshot(playerId?: string): SessionSnapshot {
    return this.engine.snapshotFor(this.now(), playerId);
  }

  lookup(): RoomLookup {
    const s = this.engine.state;
    if (s.phase === "finished" || s.phase === "ended" || this.engine.isExpired(this.now())) return { status: "ended" };
    if (s.joinsLocked) return { status: "locked" };
    if (this.engine.activePlayers().length >= s.maxPlayers) return { status: "full" };
    return {
      status: "ok",
      sessionId: s.sessionId,
      roomCode: s.roomCode,
      quizTitle: s.quiz.title,
      courseCode: s.quiz.course.courseCode,
      courseName: s.quiz.course.courseName,
      hostName: s.hostName,
      playerCount: this.engine.activePlayers().length,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Players                                                           */
  /* ---------------------------------------------------------------- */

  join(input: { nickname: string; avatarSeed: string }): JoinResult {
    const nick = sanitizeNickname(input.nickname);
    if (!nick.ok) return { ok: false, error: nick.reason === "blocked" ? "blocked_nickname" : "invalid_nickname" };
    const avatarSeed = String(input.avatarSeed).slice(0, 64) || nick.value;
    const id = randomId();
    const outcome = this.engine.addPlayer({ id, nickname: nick.value, avatarSeed }, this.now());
    if (!outcome.ok) return { ok: false, error: outcome.error };
    const token = randomToken();
    this.tokens[id] = sha256Hex(token);
    this.emit({
      type: "player.joined",
      player: { id, nickname: outcome.player.nickname, avatarSeed },
      playerCount: this.engine.activePlayers().length,
    });
    this.changed(false);
    const credentials: PlayerCredentials = {
      sessionId: this.sessionId,
      playerId: id,
      token,
      roomCode: this.roomCode,
      nickname: outcome.player.nickname,
      avatarSeed,
    };
    return { ok: true, credentials, snapshot: this.snapshot(id) };
  }

  verify(credentials: Pick<PlayerCredentials, "playerId" | "token">): boolean {
    const expected = Object.hasOwn(this.tokens, credentials.playerId) ? this.tokens[credentials.playerId] : undefined;
    if (!expected || typeof credentials.token !== "string" || !credentials.token) return false;
    return constantTimeEqual(sha256Hex(credentials.token), expected);
  }

  resume(credentials: PlayerCredentials): ResumeResult {
    if (!this.verify(credentials)) return { ok: false, error: "not_found" };
    const player = this.engine.state.players[credentials.playerId];
    if (!player) return { ok: false, error: "not_found" };
    if (player.kicked) return { ok: false, error: "kicked" };
    this.engine.setConnected(player.id, true);
    this.changed(false);
    return { ok: true, snapshot: this.snapshot(player.id) };
  }

  leave(credentials: PlayerCredentials) {
    if (!this.verify(credentials)) return;
    this.engine.removePlayer(credentials.playerId);
    this.emit({ type: "player.left", playerId: credentials.playerId, playerCount: this.engine.activePlayers().length });
    this.changed(this.engine.state.phase === "lobby");
  }

  submit(credentials: PlayerCredentials, questionId: string, payload: AnswerPayload): SubmitResult {
    if (!this.verify(credentials)) return { status: "invalid", reason: "unauthorized" };
    return this.submitVerified(credentials.playerId, questionId, payload);
  }

  private submitVerified(playerId: string, questionId: string, payload: AnswerPayload): SubmitResult {
    const result = this.engine.submitAnswer(playerId, questionId, payload, this.now());
    if (result.status === "accepted") {
      this.emit({
        type: "progress",
        questionId,
        answered: this.engine.answeredCount(),
        total: this.engine.activePlayers().length,
      });
      this.changed(false);
      if ((this.options.autoCloseWhenAllAnswered ?? true) && this.engine.everyoneAnswered()) {
        if (this.allAnsweredTimer) clearTimeout(this.allAnsweredTimer);
        // Short beat so the last answer's lock animation lands before the reveal.
        this.allAnsweredTimer = setTimeout(() => this.closeQuestion(), 900);
      }
    }
    return result;
  }

  /** Test/bot hook: submit on behalf of a registered player id without a token. */
  submitAsBot(playerId: string, questionId: string, payload: AnswerPayload): SubmitResult {
    if (!Object.hasOwn(this.tokens, playerId)) return { status: "invalid", reason: "unknown_player" };
    return this.submitVerified(playerId, questionId, payload);
  }

  /** Register an existing engine player (bots) with a token (stored hashed). */
  registerToken(playerId: string, token: string) {
    this.tokens[playerId] = sha256Hex(token);
  }

  /** Add a simulated player with a fixed id (demo bots). */
  addBot(bot: { id: string; nickname: string; avatarSeed: string }): boolean {
    const outcome = this.engine.addPlayer(bot, this.now());
    if (!outcome.ok) return false;
    this.tokens[bot.id] = sha256Hex(randomToken());
    this.emit({
      type: "player.joined",
      player: { id: bot.id, nickname: bot.nickname, avatarSeed: bot.avatarSeed },
      playerCount: this.engine.activePlayers().length,
    });
    this.changed(false);
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* Host commands                                                     */
  /* ---------------------------------------------------------------- */

  start(): HostCommandResult {
    return this.run(() => this.engine.start(this.now()));
  }

  publishQuestion(): HostCommandResult {
    return this.run(() => this.engine.openQuestion(this.now()));
  }

  closeQuestion(): HostCommandResult {
    if (this.allAnsweredTimer) clearTimeout(this.allAnsweredTimer);
    this.allAnsweredTimer = null;
    return this.run(() => this.engine.closeQuestion(this.now()));
  }

  publishResults(): HostCommandResult {
    const phase = this.engine.state.phase;
    if (phase !== "reveal" && phase !== "leaderboard") return { ok: false, error: "invalid_phase" };
    this.broadcast();
    return { ok: true, snapshot: this.snapshot() };
  }

  publishLeaderboard(): HostCommandResult {
    return this.run(() => this.engine.showLeaderboardPhase());
  }

  next(): HostCommandResult {
    return this.run(() => this.engine.next(this.now()));
  }

  finish(): HostCommandResult {
    const res = this.run(() => this.engine.finish(this.now()));
    if (res.ok) this.emit({ type: "session.ended", reason: "finished" });
    return res;
  }

  pauseGame(): HostCommandResult {
    return this.run(() => this.engine.pause(this.now()));
  }

  resumeGame(): HostCommandResult {
    return this.run(() => this.engine.resume(this.now()));
  }

  skip(): HostCommandResult {
    return this.run(() => this.engine.skip(this.now()));
  }

  setJoinsLocked(locked: boolean): HostCommandResult {
    this.engine.setJoinsLocked(locked);
    this.changed(true);
    return { ok: true, snapshot: this.snapshot() };
  }

  setLeaderboardVisible(visible: boolean): HostCommandResult {
    this.engine.setShowLeaderboard(visible);
    this.changed(true);
    return { ok: true, snapshot: this.snapshot() };
  }

  kick(playerId: string): HostCommandResult {
    if (!this.engine.kickPlayer(playerId)) return { ok: false, error: "not_found" };
    this.emit({ type: "player.kicked", playerId });
    this.changed(true);
    return { ok: true, snapshot: this.snapshot() };
  }

  end(): HostCommandResult {
    const res = this.run(() => this.engine.end(this.now(), "host_ended"));
    if (res.ok) this.emit({ type: "session.ended", reason: "host_ended" });
    return res;
  }

  summary(credentials: PlayerCredentials) {
    if (!this.verify(credentials)) return null;
    return this.engine.summaryFor(credentials.playerId);
  }

  /* ---------------------------------------------------------------- */

  private run(fn: () => { ok: boolean; error?: string }): HostCommandResult {
    const res = fn();
    if (!res.ok) return { ok: false, error: res.error };
    this.armTimer();
    this.changed(true);
    return { ok: true, snapshot: this.snapshot() };
  }

  /** Auto-close the open question when the deadline passes (plus grace). */
  private armTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const s = this.engine.state;
    if (s.phase !== "question" || s.paused || s.deadlineAt === null) return;
    const delay = Math.max(0, s.deadlineAt + s.graceMs - this.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.engine.state.phase === "question" && !this.engine.state.paused) this.closeQuestion();
    }, delay);
  }

  private changed(broadcast: boolean) {
    this.options.onChange?.(this.persisted());
    if (broadcast) this.broadcast();
  }

  private broadcast() {
    this.emit({ type: "snapshot", snapshot: this.snapshot() });
  }

  private emit(event: GameEvent) {
    this.options.onEvent(event);
  }
}
