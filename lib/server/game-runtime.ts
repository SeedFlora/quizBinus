import "server-only";

/**
 * ServerGameRuntime: the self-hosted game server.
 *
 * Every live session is a GameAuthority (the same class the local/demo mode runs in
 * a browser tab) living in this Node process. Clients talk to it through route
 * handlers (commands) and Server-Sent Events (live events). State is written behind
 * to a SessionPersistence adapter (no-op in memory mode, PostgreSQL when
 * DATABASE_URL is set) so a restart can restore running games.
 *
 * Single-instance by design: one container on Proxmox serves a whole campus
 * comfortably. Horizontal scaling (Redis pub/sub + sticky sessions) is documented
 * in docs/SCALING.md.
 */

import { GameEngine } from "@/lib/game/engine";
import { ROOM_CODE_TTL_MS, generateRoomCode } from "@/lib/game/room-code";
import { DEMO_ROOM_CODE, DEMO_SESSION_ID } from "@/lib/demo/simulate";
import type { Quiz } from "@/lib/game/types";
import { GameAuthority, type PersistedAuthority } from "@/lib/realtime/authority";
import { BotDriver, type BotConfig } from "@/lib/realtime/local/bots";
import type { GameEvent } from "@/lib/realtime/types";
import { randomId } from "@/lib/realtime/ids";

export interface SessionMeta {
  hostId: string;
  quizId: string | null;
  bots?: BotConfig;
  createdAt: number;
  /**
   * Memory mode only: sha256 of the creating browser's host key cookie
   * (lib/server/host-auth.ts). Without accounts, it is what stops a student who knows
   * the session id from driving the game.
   */
  hostKeyHash?: string;
}

export interface StoredSessionRecord {
  sessionId: string;
  persisted: PersistedAuthority;
  meta: SessionMeta;
}

/** Durable storage for live sessions. Implementations must never throw into the game loop. */
export interface SessionPersistence {
  save(record: StoredSessionRecord): Promise<void>;
  loadActive(): Promise<StoredSessionRecord[]>;
  isRoomCodeTaken(code: string): Promise<boolean>;
  /** Resolves once every queued save is written (graceful shutdown). */
  flush?(): Promise<void>;
}

export const memoryPersistence: SessionPersistence = {
  async save() {},
  async loadActive() {
    return [];
  },
  async isRoomCodeTaken() {
    return false;
  },
};

export interface Subscriber {
  role: "host" | "player";
  playerId?: string;
  send: (event: GameEvent) => void;
  /** Ends the subscriber's stream (session dropped, or replaced by a newer stream). */
  close?: () => void;
}

export interface Live {
  authority: GameAuthority;
  bots: BotDriver | null;
  meta: SessionMeta;
  subscribers: Set<Subscriber>;
  lastActivity: number;
  saveTimer: ReturnType<typeof setTimeout> | null;
}

const SAVE_DEBOUNCE_MS = 400;
const SWEEP_EVERY_MS = 5 * 60 * 1000;
/** Finished games stay in memory briefly so players can load their summary. */
const FINISHED_TTL_MS = 60 * 60 * 1000;
/** Open event streams per player (tabs, reconnects racing a half-open socket); the oldest is closed. */
const MAX_STREAMS_PER_PLAYER = 3;
/**
 * Host streams per session (projector, lobby, a second device…); the oldest is closed.
 * Bounds the shared demo, whose host stream anyone may open in memory mode.
 */
const MAX_HOST_STREAMS = 8;

export class ServerGameRuntime {
  private live = new Map<string, Live>();
  private restored: Promise<void> | null = null;
  private persistence: SessionPersistence = memoryPersistence;
  private sweeper: ReturnType<typeof setInterval> | null = null;
  private closing = false;

  usePersistence(persistence: SessionPersistence) {
    this.persistence = persistence;
  }

  /** Restore running sessions once per process (after a deploy/restart). */
  ready(): Promise<void> {
    this.restored ??= this.persistence
      .loadActive()
      .then((records) => {
        for (const r of records) if (!this.live.has(r.sessionId)) this.mount(r.sessionId, r.persisted, r.meta);
      })
      .catch((err) => console.error("[nusaquest] session restore failed", err));
    this.ensureSweeper();
    return this.restored;
  }

  async createSession(
    quiz: Quiz,
    host: { id: string; displayName: string },
    opts: { sessionId?: string; roomCode?: string; bots?: BotConfig; hostKeyHash?: string } = {},
  ) {
    await this.ready();
    const activeCodes = new Set([...this.live.values()].filter((l) => !isOver(l)).map((l) => l.authority.roomCode));
    const roomCode =
      opts.roomCode ??
      // The demo PIN belongs to the shared demo (and the offline solo demo), never to a class.
      (await generateRoomCode(
        async (code) =>
          code === DEMO_ROOM_CODE || activeCodes.has(code) || (await this.persistence.isRoomCodeTaken(code)),
      ));
    const sessionId = opts.sessionId ?? randomId();
    const engine = GameEngine.create({
      sessionId,
      roomCode,
      hostName: host.displayName,
      quiz,
      now: Date.now(),
      ttlMs: ROOM_CODE_TTL_MS,
    });
    const meta: SessionMeta = {
      hostId: host.id,
      quizId: quiz.id,
      bots: opts.bots,
      createdAt: Date.now(),
      ...(opts.hostKeyHash ? { hostKeyHash: opts.hostKeyHash } : {}),
    };
    const live = this.mount(sessionId, { engine: engine.serialize(), tokens: {} }, meta);
    this.persistSoon(sessionId, live, true);
    return { sessionId, roomCode };
  }

  get(sessionId: string): Live | undefined {
    const l = this.live.get(sessionId);
    if (l) l.lastActivity = Date.now();
    return l;
  }

  findByRoom(roomCode: string): Live | undefined {
    for (const l of this.live.values()) {
      if (l.authority.roomCode === roomCode && !isOver(l)) return l;
    }
    return undefined;
  }

  /** A finished/ended session that still holds this PIN in memory (lookup answers "ended"). */
  findEndedByRoom(roomCode: string): Live | undefined {
    for (const l of this.live.values()) {
      if (l.authority.roomCode === roomCode && isOver(l)) return l;
    }
    return undefined;
  }

  /** Every session in memory (host session lists). */
  list(): Array<[sessionId: string, live: Live]> {
    return [...this.live.entries()];
  }

  /** Remove a session from memory (e.g. restarting the shared demo). Open streams are closed. */
  drop(sessionId: string) {
    const l = this.live.get(sessionId);
    if (!l) return;
    l.authority.dispose();
    l.bots?.dispose();
    if (l.saveTimer) clearTimeout(l.saveTimer);
    this.live.delete(sessionId);
    const subscribers = [...l.subscribers];
    l.subscribers.clear();
    for (const s of subscribers) s.close?.();
  }

  subscribe(sessionId: string, subscriber: Subscriber): () => void {
    const l = this.live.get(sessionId);
    if (!l) return () => undefined;
    if (this.closing) {
      // Shutting down: end the stream right after its first frame; the client retries
      // with backoff and lands on the next process, which restores the session.
      queueMicrotask(() => subscriber.close?.());
      return () => undefined;
    }
    const isPlayer = subscriber.role === "player" && Boolean(subscriber.playerId);
    const mine = [...l.subscribers].filter((s) => (isPlayer ? s.playerId === subscriber.playerId : s.role === "host"));
    const max = isPlayer ? MAX_STREAMS_PER_PLAYER : MAX_HOST_STREAMS;
    // Sets iterate in insertion order: the first entries are the oldest streams.
    for (const stale of mine.slice(0, Math.max(0, mine.length - max + 1))) {
      l.subscribers.delete(stale);
      stale.close?.();
    }
    l.subscribers.add(subscriber);
    if (subscriber.role === "player" && subscriber.playerId) l.authority.engine.setConnected(subscriber.playerId, true);
    return () => {
      if (!l.subscribers.delete(subscriber)) return;
      const pid = subscriber.playerId;
      if (subscriber.role === "player" && pid && ![...l.subscribers].some((s) => s.playerId === pid)) {
        // Last stream for this player closed: mark disconnected so "everyone answered" ignores them.
        l.authority.engine.setConnected(pid, false);
      }
    };
  }

  /** True once shutdown() started: new event streams are refused (503) from then on. */
  get isShuttingDown(): boolean {
    return this.closing;
  }

  /** Writes every debounced save now and waits until the persistence has stored them. */
  async flush(): Promise<void> {
    for (const [id, l] of this.live) if (l.saveTimer) this.persistSoon(id, l, true);
    await this.persistence.flush?.().catch((err) => console.error("[nusaquest] final save failed", err));
  }

  /**
   * Graceful stop (SIGTERM from `docker compose stop|restart|up`, see instrumentation.ts):
   * write every pending save now, then end all event streams. Next.js waits for open
   * connections before it exits and SSE streams never end on their own, so without
   * this a restart hangs for the whole stop grace period and is then killed mid-write.
   * Clients reconnect with backoff and resume against the restored session.
   */
  async shutdown(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    await this.flush();
    for (const l of this.live.values()) {
      const subscribers = [...l.subscribers];
      l.subscribers.clear();
      for (const s of subscribers) s.close?.();
    }
  }

  stats() {
    return {
      sessions: this.live.size,
      subscribers: [...this.live.values()].reduce((n, l) => n + l.subscribers.size, 0),
    };
  }

  /* ---------------------------------------------------------------- */

  private mount(sessionId: string, persisted: PersistedAuthority, meta: SessionMeta): Live {
    const subscribers = new Set<Subscriber>();
    let live: Live | null = null;
    const authority = new GameAuthority(persisted, {
      onEvent: (event) => {
        for (const s of subscribers) {
          try {
            s.send(event);
          } catch {
            subscribers.delete(s);
          }
        }
        if (event.type === "player.kicked") {
          // The kicked player has just received the event; their streams end here.
          for (const s of [...subscribers]) {
            if (s.role !== "player" || s.playerId !== event.playerId) continue;
            subscribers.delete(s);
            s.close?.();
          }
        }
        if (event.type === "snapshot" || event.type === "player.joined") live?.bots?.sync();
      },
      onChange: () => {
        if (live) this.persistSoon(sessionId, live, false);
      },
    });
    const bots = meta.bots ? new BotDriver(authority, meta.bots) : null;
    live = { authority, bots, meta, subscribers, lastActivity: Date.now(), saveTimer: null };
    this.live.set(sessionId, live);
    bots?.sync();
    return live;
  }

  private persistSoon(sessionId: string, live: Live, immediate: boolean) {
    // The shared demo is ephemeral by design (bots, no host account): never stored.
    if (sessionId === DEMO_SESSION_ID) return;
    if (live.saveTimer) clearTimeout(live.saveTimer);
    const run = () => {
      live.saveTimer = null;
      void this.persistence
        .save({ sessionId, persisted: live.authority.persisted(), meta: live.meta })
        .catch((err) => console.error("[nusaquest] persist failed", sessionId, err));
    };
    if (immediate) run();
    else live.saveTimer = setTimeout(run, SAVE_DEBOUNCE_MS);
  }

  private ensureSweeper() {
    if (this.sweeper) return;
    this.sweeper = setInterval(() => {
      const now = Date.now();
      for (const [id, l] of this.live) {
        const s = l.authority.engine.state;
        const over = isOver(l);
        if ((over && now - (s.endedAt ?? now) > FINISHED_TTL_MS) || l.authority.engine.isExpired(now)) {
          if (!over) l.authority.end();
          // Write the final state (the expiry's "ended", or a still-debounced save) now:
          // drop() clears the pending save timer, so it would otherwise never be stored.
          if (!over || l.saveTimer) this.persistSoon(id, l, true);
          this.drop(id);
        }
      }
    }, SWEEP_EVERY_MS);
    // Never keep the process alive just for the sweeper.
    (this.sweeper as { unref?: () => void }).unref?.();
  }
}

function isOver(l: Live): boolean {
  const phase = l.authority.engine.state.phase;
  return phase === "finished" || phase === "ended";
}

const globalForRuntime = globalThis as unknown as { __nqRuntime?: ServerGameRuntime };

/** Process-wide singleton (survives dev hot reloads). */
export function getGameRuntime(): ServerGameRuntime {
  globalForRuntime.__nqRuntime ??= new ServerGameRuntime();
  return globalForRuntime.__nqRuntime;
}
