/**
 * HybridDemoProvider: the demo PIN (482913) and the "demo" session id.
 *
 * The demo prefers the SERVER: POST /api/demo/host starts a shared demo room with
 * simulated students in the game server, so a projector and real phones on the same
 * network meet in one room. When the server has no demo running (lookup not_found /
 * ended) or cannot be reached, the demo PIN falls back to the OFFLINE solo demo in
 * this tab (LocalRealtimeProvider: bots + a virtual host), exactly as before.
 *
 * Which transport a player's identity belongs to is remembered per player id
 * (localStorage), so a refresh resumes on the right one without guessing; without
 * that record the server is asked first.
 */

import type { AnswerPayload, PlayerSummary, SessionSnapshot, SubmitResult } from "@/lib/game/types";
import { DEMO_ROOM_CODE, DEMO_SESSION_ID } from "@/lib/demo/simulate";
import type { LocalRealtimeProvider } from "./local/provider";
import type {
  ConnectionStatus,
  CreateSessionInput,
  CreateSessionResult,
  GameEvent,
  HostCommandResult,
  JoinResult,
  PlayerCredentials,
  RealtimeGameProvider,
  ResumeResult,
  Role,
  RoomLookup,
  Unsubscribe,
} from "./types";

export type DemoTransport = "server" | "local";

const VIA_KEY = "nq:demo:via";

function readVia(): { playerId: string; via: DemoTransport } | null {
  try {
    const raw = window.localStorage.getItem(VIA_KEY);
    const match = raw?.match(/^(.+):(server|local)$/);
    return match ? { playerId: match[1]!, via: match[2] as DemoTransport } : null;
  } catch {
    return null;
  }
}

function writeVia(playerId: string, via: DemoTransport) {
  try {
    window.localStorage.setItem(VIA_KEY, `${playerId}:${via}`);
  } catch {
    /* private mode: the server is asked again after a refresh */
  }
}

export class HybridDemoProvider implements RealtimeGameProvider {
  readonly kind = "demo" as const;
  /** Transport of the demo this browser hosts (set by ensureHostDemo). */
  private hostVia: Promise<DemoTransport> | null = null;
  /** Transport behind the demo PIN, from the last lookup. */
  private roomVia: DemoTransport | null = null;
  private playerVia = new Map<string, Promise<DemoTransport>>();

  constructor(
    private readonly server: RealtimeGameProvider,
    /** Lazy: the offline runtime (BroadcastChannel, Web Locks) only starts when needed. */
    private readonly local: () => LocalRealtimeProvider,
  ) {}

  /* ---------------------------------------------------------------- */
  /* routing                                                           */
  /* ---------------------------------------------------------------- */

  private pick(via: DemoTransport): RealtimeGameProvider {
    return via === "server" ? this.server : this.local();
  }

  private remember(playerId: string, via: DemoTransport) {
    this.playerVia.set(playerId, Promise.resolve(via));
    writeVia(playerId, via);
  }

  /** Which transport a player identity lives on: remembered, or asked of the server first. */
  private viaFor(c: PlayerCredentials): Promise<DemoTransport> {
    const known = this.playerVia.get(c.playerId);
    if (known) return known;
    const stored = readVia();
    if (stored?.playerId === c.playerId) {
      this.remember(c.playerId, stored.via);
      return Promise.resolve(stored.via);
    }
    const probe = this.server.resumePlayer(c).then((res): DemoTransport => {
      const via = res.ok || res.error === "kicked" ? "server" : "local";
      writeVia(c.playerId, via);
      return via;
    });
    this.playerVia.set(c.playerId, probe);
    return probe;
  }

  private async forRole(role: Role): Promise<RealtimeGameProvider> {
    if (role.kind === "player") return this.pick(await this.viaFor(role.credentials));
    return this.hostProvider();
  }

  private async hostProvider(): Promise<RealtimeGameProvider> {
    return this.pick(this.hostVia ? await this.hostVia : "server");
  }

  /* ---------------------------------------------------------------- */
  /* host                                                              */
  /* ---------------------------------------------------------------- */

  /**
   * /host/session/demo: starts (or reuses) the shared server demo, and checks that this
   * browser may drive it (database mode: signed-in lecturers only). Otherwise the demo
   * runs offline in this tab. Called on every mount: a finished demo is replaced.
   */
  ensureHostDemo(): Promise<DemoTransport> {
    const via = (async (): Promise<DemoTransport> => {
      try {
        const res = await fetch("/api/demo/host", { method: "POST", credentials: "same-origin", cache: "no-store" });
        if (res.ok) {
          const state = await fetch(`/api/sessions/${DEMO_SESSION_ID}/state`, {
            credentials: "same-origin",
            cache: "no-store",
          });
          if (state.ok) return "server";
        }
      } catch {
        /* server unreachable: offline demo */
      }
      await this.local().ensureHostDemo();
      return "local";
    })();
    this.hostVia = via;
    return via;
  }

  createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
    return this.server.createSession(input);
  }

  private async hostOp(run: (p: RealtimeGameProvider) => Promise<HostCommandResult>): Promise<HostCommandResult> {
    return run(await this.hostProvider());
  }

  startGame = (id: string) => this.hostOp((p) => p.startGame(id));
  publishQuestion = (id: string) => this.hostOp((p) => p.publishQuestion(id));
  closeQuestion = (id: string) => this.hostOp((p) => p.closeQuestion(id));
  publishResults = (id: string) => this.hostOp((p) => p.publishResults(id));
  publishLeaderboard = (id: string) => this.hostOp((p) => p.publishLeaderboard(id));
  nextQuestion = (id: string) => this.hostOp((p) => p.nextQuestion(id));
  finishGame = (id: string) => this.hostOp((p) => p.finishGame(id));
  pauseGame = (id: string) => this.hostOp((p) => p.pauseGame(id));
  resumeGame = (id: string) => this.hostOp((p) => p.resumeGame(id));
  skipQuestion = (id: string) => this.hostOp((p) => p.skipQuestion(id));
  endSession = (id: string) => this.hostOp((p) => p.endSession(id));
  setJoinsLocked = (id: string, locked: boolean) => this.hostOp((p) => p.setJoinsLocked(id, locked));
  setLeaderboardVisible = (id: string, visible: boolean) => this.hostOp((p) => p.setLeaderboardVisible(id, visible));
  kickPlayer = (id: string, playerId: string) => this.hostOp((p) => p.kickPlayer(id, playerId));

  /* ---------------------------------------------------------------- */
  /* player                                                            */
  /* ---------------------------------------------------------------- */

  async resolveRoom(roomCode: string): Promise<RoomLookup> {
    if (roomCode !== DEMO_ROOM_CODE) return this.server.resolveRoom(roomCode);
    const lookup = await this.server.resolveRoom(roomCode);
    // "not_found" also covers an unreachable server (the provider's network fallback).
    if (lookup.status !== "not_found" && lookup.status !== "ended") {
      this.roomVia = "server";
      return lookup;
    }
    this.roomVia = "local";
    return this.local().resolveRoom(roomCode);
  }

  async joinSession(input: { roomCode: string; nickname: string; avatarSeed: string }): Promise<JoinResult> {
    if (this.roomVia === null) await this.resolveRoom(input.roomCode);
    if (this.roomVia === "server") {
      const res = await this.server.joinSession(input);
      if (res.ok) this.remember(res.credentials.playerId, "server");
      if (res.ok || (res.error !== "not_found" && res.error !== "ended" && res.error !== "network")) return res;
      // The server demo ended (or became unreachable) between lookup and join.
      await this.local().resolveRoom(input.roomCode);
      this.roomVia = "local";
    }
    const res = await this.local().joinSession(input);
    if (res.ok) this.remember(res.credentials.playerId, "local");
    return res;
  }

  async resumePlayer(c: PlayerCredentials): Promise<ResumeResult> {
    return this.pick(await this.viaFor(c)).resumePlayer(c);
  }

  async leaveSession(c: PlayerCredentials): Promise<void> {
    return this.pick(await this.viaFor(c)).leaveSession(c);
  }

  async submitAnswer(c: PlayerCredentials, questionId: string, payload: AnswerPayload): Promise<SubmitResult> {
    return this.pick(await this.viaFor(c)).submitAnswer(c, questionId, payload);
  }

  async getSummary(c: PlayerCredentials): Promise<PlayerSummary | null> {
    return this.pick(await this.viaFor(c)).getSummary(c);
  }

  /* ---------------------------------------------------------------- */
  /* live                                                              */
  /* ---------------------------------------------------------------- */

  async getSnapshot(sessionId: string, role: Role): Promise<SessionSnapshot | null> {
    return (await this.forRole(role)).getSnapshot(sessionId, role);
  }

  subscribe(
    sessionId: string,
    role: Role,
    onEvent: (event: GameEvent) => void,
    onStatus?: (status: ConnectionStatus) => void,
  ): Unsubscribe {
    let disposed = false;
    let inner: Unsubscribe | null = null;
    void this.forRole(role).then((provider) => {
      if (!disposed) inner = provider.subscribe(sessionId, role, onEvent, onStatus);
    });
    return () => {
      disposed = true;
      inner?.();
    };
  }
}
