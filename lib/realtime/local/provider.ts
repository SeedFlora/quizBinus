/**
 * LocalRealtimeProvider: RealtimeGameProvider over LocalRuntime.
 * Calls run in-tab when this tab owns the session, otherwise they are routed to the
 * owning tab over BroadcastChannel.
 */

import { getLocalQuizRepository } from "@/lib/quiz/repository";
import { DEMO_LECTURER, OS_BATTLE } from "@/lib/seed/quizzes";
import { DEMO_ROOM_CODE, DEMO_SESSION_ID } from "@/lib/demo/simulate";
import { isValidRoomCode } from "@/lib/game/room-code";
import type { AnswerPayload, PlayerSummary, SessionSnapshot, SubmitResult } from "@/lib/game/types";
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
} from "../types";
import { randomId } from "../ids";
import type { GameAuthority } from "../authority";
import { getLocalRuntime, HEARTBEAT_MS, readStoredSession, type LocalRuntime, type WireMessage } from "./runtime";

const REQUEST_TIMEOUT = 1500;
const HOST_NAME = `${DEMO_LECTURER.salutation} ${DEMO_LECTURER.fullName}`;

type HostOp =
  | "start"
  | "publishQuestion"
  | "closeQuestion"
  | "publishResults"
  | "publishLeaderboard"
  | "next"
  | "finish"
  | "pause"
  | "resume"
  | "skip"
  | "end";

function registerHandlers(rt: LocalRuntime) {
  rt.handle("lookup", (h) => h.authority.lookup());
  rt.handle("join", (h, input: { nickname: string; avatarSeed: string }) => h.authority.join(input));
  rt.handle("resume", (h, c: PlayerCredentials) => h.authority.resume(c));
  rt.handle("leave", (h, c: PlayerCredentials) => h.authority.leave(c));
  rt.handle("submit", (h, c: PlayerCredentials, qid: string, payload: AnswerPayload) =>
    h.authority.submit(c, qid, payload),
  );
  rt.handle("summary", (h, c: PlayerCredentials) => h.authority.summary(c));
  rt.handle("snapshot", (h, c: PlayerCredentials | null) =>
    c ? (h.authority.verify(c) ? h.authority.snapshot(c.playerId) : null) : h.authority.snapshot(),
  );
  rt.handle("host", (h, op: HostOp) => hostCommand(h.authority, op));
  rt.handle("lock", (h, locked: boolean) => h.authority.setJoinsLocked(locked));
  rt.handle("leaderboardVisible", (h, visible: boolean) => h.authority.setLeaderboardVisible(visible));
  rt.handle("kick", (h, playerId: string) => h.authority.kick(playerId));
}

function hostCommand(a: GameAuthority, op: HostOp): HostCommandResult {
  switch (op) {
    case "start":
      return a.start();
    case "publishQuestion":
      return a.publishQuestion();
    case "closeQuestion":
      return a.closeQuestion();
    case "publishResults":
      return a.publishResults();
    case "publishLeaderboard":
      return a.publishLeaderboard();
    case "next":
      return a.next();
    case "finish":
      return a.finish();
    case "pause":
      return a.pauseGame();
    case "resume":
      return a.resumeGame();
    case "skip":
      return a.skip();
    case "end":
      return a.end();
  }
}

export class LocalRealtimeProvider implements RealtimeGameProvider {
  readonly kind = "local" as const;
  private rt: LocalRuntime;
  private pending = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

  constructor() {
    this.rt = getLocalRuntime();
    registerHandlers(this.rt);
    this.rt.onWire((msg) => {
      if (msg.t !== "res") return;
      const p = this.pending.get(msg.rid);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(msg.rid);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new Error(msg.error));
    });
  }

  /* ---------------------------------------------------------------- */
  /* routing                                                           */
  /* ---------------------------------------------------------------- */

  private request<T>(target: { sessionId?: string; roomCode?: string }, op: string, args: unknown[] = []): Promise<T> {
    const rid = randomId();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(rid);
        reject(new Error("timeout"));
      }, REQUEST_TIMEOUT);
      this.pending.set(rid, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.rt.post({ t: "req", rid, op, args, target } satisfies WireMessage);
    });
  }

  /** Make sure a stored session is served by some tab: this one if nobody else is. */
  private async ensureHosted(sessionId: string) {
    if (this.rt.owns(sessionId)) return;
    if (!readStoredSession(sessionId)) return;
    await this.rt.host(sessionId);
  }

  private async hostOp(sessionId: string, op: HostOp): Promise<HostCommandResult> {
    await this.ensureHosted(sessionId);
    const h = this.rt.get(sessionId);
    if (h) return hostCommand(h.authority, op);
    try {
      return await this.request<HostCommandResult>({ sessionId }, "host", [op]);
    } catch {
      return { ok: false, error: "network" };
    }
  }

  /* ---------------------------------------------------------------- */
  /* lookup                                                            */
  /* ---------------------------------------------------------------- */

  async resolveRoom(roomCode: string): Promise<RoomLookup> {
    if (!isValidRoomCode(roomCode)) return { status: "not_found" };
    const local = this.rt.findByRoom(roomCode);
    if (local) return local.authority.lookup();
    try {
      return await this.request<RoomLookup>({ roomCode }, "lookup");
    } catch {
      if (roomCode === DEMO_ROOM_CODE) return this.startSoloDemo();
      return { status: "not_found" };
    }
  }

  /** No host tab is serving the demo PIN: run a solo demo (bots + virtual host) in this tab. */
  private async startSoloDemo(): Promise<RoomLookup> {
    const existing = readStoredSession(DEMO_SESSION_ID);
    // Reuse only a solo demo still waiting in its lobby; anything else starts fresh.
    const reusable = existing?.virtualHost === true && existing.persisted.engine.phase === "lobby";
    if (!reusable) {
      this.rt.forget(DEMO_SESSION_ID);
      await this.rt.createSession(OS_BATTLE, HOST_NAME, {
        sessionId: DEMO_SESSION_ID,
        roomCode: DEMO_ROOM_CODE,
        bots: { count: 41, joinEvery: 350 },
        virtualHost: true,
      });
    } else {
      await this.rt.host(DEMO_SESSION_ID);
    }
    const h = this.rt.get(DEMO_SESSION_ID);
    return h ? h.authority.lookup() : { status: "not_found" };
  }

  /* ---------------------------------------------------------------- */
  /* host                                                              */
  /* ---------------------------------------------------------------- */

  async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
    const quiz = await getLocalQuizRepository().get(input.quizId);
    if (!quiz) throw new Error("quiz_not_found");
    return this.rt.createSession(quiz, HOST_NAME);
  }

  /** Host demo at /host/session/demo: bots trickle into the lobby, the lecturer drives. */
  async ensureHostDemo(): Promise<CreateSessionResult> {
    const existing = readStoredSession(DEMO_SESSION_ID);
    const phase = existing?.persisted.engine.phase;
    if (existing && existing.virtualHost !== true && phase !== "finished" && phase !== "ended") {
      await this.rt.host(DEMO_SESSION_ID);
    } else {
      this.rt.forget(DEMO_SESSION_ID);
      await this.rt.createSession(OS_BATTLE, HOST_NAME, {
        sessionId: DEMO_SESSION_ID,
        roomCode: DEMO_ROOM_CODE,
        bots: { count: 41, joinEvery: 700 },
      });
    }
    return { sessionId: DEMO_SESSION_ID, roomCode: DEMO_ROOM_CODE };
  }

  startGame = (id: string) => this.hostOp(id, "start");
  publishQuestion = (id: string) => this.hostOp(id, "publishQuestion");
  closeQuestion = (id: string) => this.hostOp(id, "closeQuestion");
  publishResults = (id: string) => this.hostOp(id, "publishResults");
  publishLeaderboard = (id: string) => this.hostOp(id, "publishLeaderboard");
  nextQuestion = (id: string) => this.hostOp(id, "next");
  finishGame = (id: string) => this.hostOp(id, "finish");
  pauseGame = (id: string) => this.hostOp(id, "pause");
  resumeGame = (id: string) => this.hostOp(id, "resume");
  skipQuestion = (id: string) => this.hostOp(id, "skip");
  endSession = (id: string) => this.hostOp(id, "end");

  async setJoinsLocked(sessionId: string, locked: boolean): Promise<HostCommandResult> {
    await this.ensureHosted(sessionId);
    const h = this.rt.get(sessionId);
    if (h) return h.authority.setJoinsLocked(locked);
    return this.request<HostCommandResult>({ sessionId }, "lock", [locked]).catch(() => ({
      ok: false,
      error: "network",
    }));
  }

  async setLeaderboardVisible(sessionId: string, visible: boolean): Promise<HostCommandResult> {
    await this.ensureHosted(sessionId);
    const h = this.rt.get(sessionId);
    if (h) return h.authority.setLeaderboardVisible(visible);
    return this.request<HostCommandResult>({ sessionId }, "leaderboardVisible", [visible]).catch(() => ({
      ok: false,
      error: "network",
    }));
  }

  async kickPlayer(sessionId: string, playerId: string): Promise<HostCommandResult> {
    await this.ensureHosted(sessionId);
    const h = this.rt.get(sessionId);
    if (h) return h.authority.kick(playerId);
    return this.request<HostCommandResult>({ sessionId }, "kick", [playerId]).catch(() => ({
      ok: false,
      error: "network",
    }));
  }

  /* ---------------------------------------------------------------- */
  /* player                                                            */
  /* ---------------------------------------------------------------- */

  async joinSession(input: { roomCode: string; nickname: string; avatarSeed: string }): Promise<JoinResult> {
    const local = this.rt.findByRoom(input.roomCode);
    if (local) return local.authority.join(input);
    try {
      return await this.request<JoinResult>({ roomCode: input.roomCode }, "join", [input]);
    } catch {
      return { ok: false, error: "network" };
    }
  }

  async resumePlayer(c: PlayerCredentials): Promise<ResumeResult> {
    await this.ensureHostedIfSolo(c.sessionId);
    const h = this.rt.get(c.sessionId);
    if (h) return h.authority.resume(c);
    try {
      return await this.request<ResumeResult>({ sessionId: c.sessionId }, "resume", [c]);
    } catch {
      return { ok: false, error: "network" };
    }
  }

  async leaveSession(c: PlayerCredentials): Promise<void> {
    const h = this.rt.get(c.sessionId);
    if (h) return void h.authority.leave(c);
    await this.request({ sessionId: c.sessionId }, "leave", [c]).catch(() => undefined);
  }

  async submitAnswer(c: PlayerCredentials, questionId: string, payload: AnswerPayload): Promise<SubmitResult> {
    const h = this.rt.get(c.sessionId);
    if (h) return h.authority.submit(c, questionId, payload);
    try {
      return await this.request<SubmitResult>({ sessionId: c.sessionId }, "submit", [c, questionId, payload]);
    } catch {
      return { status: "invalid", reason: "network" };
    }
  }

  async getSummary(c: PlayerCredentials): Promise<PlayerSummary | null> {
    const h = this.rt.get(c.sessionId);
    if (h) return h.authority.summary(c);
    return this.request<PlayerSummary | null>({ sessionId: c.sessionId }, "summary", [c]).catch(() => null);
  }

  /** A solo demo lives in the player's own tab; after a refresh we must re-host it here. */
  private async ensureHostedIfSolo(sessionId: string) {
    if (this.rt.owns(sessionId)) return;
    const stored = readStoredSession(sessionId);
    if (stored?.virtualHost) await this.rt.host(sessionId);
  }

  /* ---------------------------------------------------------------- */
  /* live                                                              */
  /* ---------------------------------------------------------------- */

  async getSnapshot(sessionId: string, role: Role): Promise<SessionSnapshot | null> {
    if (role.kind === "host") await this.ensureHosted(sessionId);
    else await this.ensureHostedIfSolo(sessionId);
    const h = this.rt.get(sessionId);
    const creds = role.kind === "player" ? role.credentials : null;
    if (h) {
      if (creds) return h.authority.verify(creds) ? h.authority.snapshot(creds.playerId) : null;
      return h.authority.snapshot();
    }
    return this.request<SessionSnapshot | null>({ sessionId }, "snapshot", [creds]).catch(() => null);
  }

  subscribe(
    sessionId: string,
    role: Role,
    onEvent: (event: GameEvent) => void,
    onStatus?: (status: ConnectionStatus) => void,
  ): Unsubscribe {
    let disposed = false;
    let lastAlive = Date.now();
    let status: ConnectionStatus = "connecting";
    const setStatus = (next: ConnectionStatus) => {
      if (next === status) return;
      const wasDown = status === "reconnecting" || status === "offline";
      status = next;
      onStatus?.(next);
      if (next === "online" && wasDown) {
        // Resync after a gap: the snapshot is authoritative.
        void this.getSnapshot(sessionId, role).then(
          (s) => s && !disposed && onEvent({ type: "snapshot", snapshot: s }),
        );
      }
    };

    let offLocal: () => void = () => undefined;
    const offWire = this.rt.onWire((msg) => {
      if (msg.t === "evt" && msg.sessionId === sessionId && !this.rt.owns(sessionId)) onEvent(msg.event);
      if (msg.t === "alive" && msg.sessionId === sessionId) {
        lastAlive = Date.now();
        setStatus("online");
      }
    });

    const watchdog = setInterval(() => {
      if (this.rt.owns(sessionId)) return setStatus("online");
      const gap = Date.now() - lastAlive;
      if (gap > HEARTBEAT_MS * 5) setStatus("offline");
      else if (gap > HEARTBEAT_MS * 2.5) setStatus("reconnecting");
    }, 1000);

    const onOffline = () => setStatus("offline");
    const onOnline = () => setStatus(this.rt.owns(sessionId) ? "online" : "reconnecting");
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    // Initial state. getSnapshot may take ownership (host / solo demo), so the
    // in-tab listener is attached only after it resolves.
    void this.getSnapshot(sessionId, role).then((snapshot) => {
      if (disposed) return;
      offLocal = this.rt.addListener(sessionId, onEvent);
      if (snapshot) {
        onEvent({ type: "snapshot", snapshot });
        setStatus("online");
      } else {
        setStatus("reconnecting");
      }
    });

    return () => {
      disposed = true;
      offLocal();
      offWire();
      clearInterval(watchdog);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }
}
