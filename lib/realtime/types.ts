/**
 * RealtimeGameProvider: the only surface the UI uses to talk to a live game.
 *
 * Implementations:
 *   - ServerRealtimeProvider  the self-hosted game server in the Next.js process is the
 *                             authority; JSON commands + Server-Sent Events
 *   - LocalRealtimeProvider   host tab is the authority; BroadcastChannel between tabs
 *   - HybridDemoProvider      demo PIN / "demo" session: the server demo, falling back
 *                             to the offline solo demo in this tab
 *
 * A Socket.IO/Redis implementation only needs to satisfy this interface; no screen
 * changes (docs/SCALING.md).
 */

import type { AnswerPayload, PlayerSummary, Quiz, SessionSnapshot, SubmitResult } from "@/lib/game/types";
import type { JoinError } from "@/lib/game/engine";

export type ProviderKind = "local" | "server" | "demo";
export type ConnectionStatus = "connecting" | "online" | "reconnecting" | "offline";

/** What a player keeps (localStorage) to survive refreshes for the session's lifetime. */
export interface PlayerCredentials {
  sessionId: string;
  playerId: string;
  /** Opaque secret; the server stores only its hash. */
  token: string;
  roomCode: string;
  nickname: string;
  avatarSeed: string;
}

export type RoomLookup =
  | {
      status: "ok";
      sessionId: string;
      roomCode: string;
      quizTitle: string;
      courseCode: string;
      courseName: string;
      hostName: string;
      playerCount: number;
    }
  | { status: "not_found" | "ended" | "full" | "locked" | "rate_limited" };

export type JoinResult =
  | { ok: true; credentials: PlayerCredentials; snapshot: SessionSnapshot }
  | { ok: false; error: JoinError | "invalid_nickname" | "blocked_nickname" | "rate_limited" | "network" };

export type ResumeResult =
  { ok: true; snapshot: SessionSnapshot } | { ok: false; error: "not_found" | "kicked" | "ended" | "network" };

export interface CreateSessionInput {
  quizId: string;
  /**
   * The quiz itself, for memory mode where quizzes live in the lecturer's browser.
   * Database mode ignores it and hosts the stored copy of `quizId`.
   */
  quiz?: Quiz;
}

export interface CreateSessionResult {
  sessionId: string;
  roomCode: string;
}

/** Events pushed by the authority. `snapshot` is always safe to render as-is. */
export type GameEvent =
  | { type: "snapshot"; snapshot: SessionSnapshot }
  | { type: "progress"; questionId: string; answered: number; total: number }
  | { type: "player.joined"; player: { id: string; nickname: string; avatarSeed: string }; playerCount: number }
  | { type: "player.left"; playerId: string; playerCount: number }
  | { type: "player.kicked"; playerId: string }
  | { type: "session.ended"; reason: "host_ended" | "expired" | "finished" };

export type Role = { kind: "host" } | { kind: "player"; credentials: PlayerCredentials };

export type Unsubscribe = () => void;

export interface HostCommandResult {
  ok: boolean;
  error?: string;
  snapshot?: SessionSnapshot;
}

export interface RealtimeGameProvider {
  readonly kind: ProviderKind;

  /* ---- lookup ---- */
  resolveRoom(roomCode: string): Promise<RoomLookup>;

  /* ---- host ---- */
  createSession(input: CreateSessionInput): Promise<CreateSessionResult>;
  startGame(sessionId: string): Promise<HostCommandResult>;
  /** intro → question: opens answers and starts the timer. */
  publishQuestion(sessionId: string): Promise<HostCommandResult>;
  /** Locks answers, scores everyone and moves to the reveal. */
  closeQuestion(sessionId: string): Promise<HostCommandResult>;
  /** Idempotent re-broadcast of the reveal (e.g. after a host refresh). */
  publishResults(sessionId: string): Promise<HostCommandResult>;
  publishLeaderboard(sessionId: string): Promise<HostCommandResult>;
  /** reveal/leaderboard → next intro, or finished after the last question. */
  nextQuestion(sessionId: string): Promise<HostCommandResult>;
  finishGame(sessionId: string): Promise<HostCommandResult>;
  pauseGame(sessionId: string): Promise<HostCommandResult>;
  resumeGame(sessionId: string): Promise<HostCommandResult>;
  skipQuestion(sessionId: string): Promise<HostCommandResult>;
  setJoinsLocked(sessionId: string, locked: boolean): Promise<HostCommandResult>;
  setLeaderboardVisible(sessionId: string, visible: boolean): Promise<HostCommandResult>;
  kickPlayer(sessionId: string, playerId: string): Promise<HostCommandResult>;
  /** Host-confirmed early end. */
  endSession(sessionId: string): Promise<HostCommandResult>;

  /* ---- player ---- */
  joinSession(input: { roomCode: string; nickname: string; avatarSeed: string }): Promise<JoinResult>;
  resumePlayer(credentials: PlayerCredentials): Promise<ResumeResult>;
  leaveSession(credentials: PlayerCredentials): Promise<void>;
  submitAnswer(credentials: PlayerCredentials, questionId: string, payload: AnswerPayload): Promise<SubmitResult>;
  getSummary(credentials: PlayerCredentials): Promise<PlayerSummary | null>;

  /* ---- live state ---- */
  getSnapshot(sessionId: string, role: Role): Promise<SessionSnapshot | null>;
  subscribe(
    sessionId: string,
    role: Role,
    onEvent: (event: GameEvent) => void,
    onStatus?: (status: ConnectionStatus) => void,
  ): Unsubscribe;
}
