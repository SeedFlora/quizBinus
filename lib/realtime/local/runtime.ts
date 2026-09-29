/**
 * LocalRuntime: turns the host's browser tab into the game server.
 *
 * - Sessions are owned by exactly one tab (Web Locks when available), persisted to
 *   localStorage so a host refresh resumes the game.
 * - Other tabs of the same browser (players, a second host view) talk to the owner
 *   over BroadcastChannel with request/response messages.
 * - The owner emits an "alive" heartbeat; clients use it to detect disconnects.
 *
 * This powers local classroom demos with zero backend and the Playwright E2E suite.
 * Production multi-device play uses the server provider (lib/realtime/server).
 */

import { GameEngine } from "@/lib/game/engine";
import { generateRoomCode } from "@/lib/game/room-code";
import type { Quiz } from "@/lib/game/types";
import { GameAuthority, type PersistedAuthority } from "../authority";
import type { GameEvent } from "../types";
import { randomId } from "../ids";
import { BotDriver, VirtualHost, type BotConfig } from "./bots";

export const LOCAL_CHANNEL = "nq-local-v1";
const STORE_PREFIX = "nq:rt:";
const INDEX_KEY = "nq:rt:index";
export const HEARTBEAT_MS = 2000;

export type WireMessage =
  | { t: "req"; rid: string; op: string; args: unknown[]; target: { sessionId?: string; roomCode?: string } }
  | { t: "res"; rid: string; ok: true; result: unknown }
  | { t: "res"; rid: string; ok: false; error: string }
  | { t: "evt"; sessionId: string; event: GameEvent }
  | { t: "alive"; sessionId: string; roomCode: string };

interface StoredSession {
  persisted: PersistedAuthority;
  bots?: BotConfig;
  virtualHost?: boolean;
}

interface Hosted {
  authority: GameAuthority;
  bots: BotDriver | null;
  virtualHost: VirtualHost | null;
  listeners: Set<(e: GameEvent) => void>;
  meta: Omit<StoredSession, "persisted">;
}

function storageGet<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function storageSet(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota errors; the game keeps running in memory */
  }
}

export function listStoredSessionIds(): string[] {
  if (typeof window === "undefined") return [];
  return storageGet<string[]>(INDEX_KEY) ?? [];
}

export function readStoredSession(sessionId: string): StoredSession | null {
  if (typeof window === "undefined") return null;
  return storageGet<StoredSession>(STORE_PREFIX + sessionId);
}

export class LocalRuntime {
  private hosted = new Map<string, Hosted>();
  private channel: BroadcastChannel | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private handlers = new Map<string, (...args: never[]) => unknown>();

  constructor() {
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(LOCAL_CHANNEL);
      this.channel.addEventListener("message", (e: MessageEvent<WireMessage>) => this.onMessage(e.data));
    }
  }

  /* ---------------------------------------------------------------- */
  /* Ownership                                                         */
  /* ---------------------------------------------------------------- */

  owns(sessionId: string) {
    return this.hosted.has(sessionId);
  }

  get(sessionId: string): Hosted | undefined {
    return this.hosted.get(sessionId);
  }

  findByRoom(roomCode: string): Hosted | undefined {
    for (const h of this.hosted.values()) if (h.authority.roomCode === roomCode) return h;
    return undefined;
  }

  async createSession(
    quiz: Quiz,
    hostName: string,
    opts: { sessionId?: string; roomCode?: string; bots?: BotConfig; virtualHost?: boolean } = {},
  ) {
    const taken = new Set(listStoredSessionIds().map((id) => readStoredSession(id)?.persisted.engine.roomCode));
    const roomCode = opts.roomCode ?? (await generateRoomCode((c) => taken.has(c)));
    const sessionId = opts.sessionId ?? randomId();
    const engine = GameEngine.create({ sessionId, roomCode, hostName, quiz, now: Date.now() });
    const stored: StoredSession = {
      persisted: { engine: engine.serialize(), tokens: {} },
      bots: opts.bots,
      virtualHost: opts.virtualHost,
    };
    storageSet(STORE_PREFIX + sessionId, stored);
    storageSet(INDEX_KEY, [sessionId, ...listStoredSessionIds().filter((id) => id !== sessionId)].slice(0, 50));
    await this.host(sessionId);
    return { sessionId, roomCode };
  }

  /**
   * Take ownership of a stored session in this tab. Returns false if another tab
   * already owns it (that tab keeps serving; this one becomes a client).
   */
  async host(sessionId: string): Promise<boolean> {
    if (this.hosted.has(sessionId)) return true;
    const stored = readStoredSession(sessionId);
    if (!stored) return false;
    const acquired = await this.acquireLock(sessionId);
    if (!acquired) return false;
    if (this.hosted.has(sessionId)) return true;

    const listeners = new Set<(e: GameEvent) => void>();
    let hosted: Hosted | null = null;
    const authority = new GameAuthority(stored.persisted, {
      onEvent: (event) => {
        listeners.forEach((l) => l(event));
        this.post({ t: "evt", sessionId, event });
        if (event.type === "snapshot" || event.type === "player.joined") {
          hosted?.bots?.sync();
          hosted?.virtualHost?.sync();
        }
      },
      onChange: (persisted) => storageSet(STORE_PREFIX + sessionId, { ...stored, persisted }),
    });
    const bots = stored.bots ? new BotDriver(authority, stored.bots) : null;
    const virtualHost = stored.virtualHost ? new VirtualHost(authority, bots) : null;
    hosted = { authority, bots, virtualHost, listeners, meta: { bots: stored.bots, virtualHost: stored.virtualHost } };
    this.hosted.set(sessionId, hosted);
    bots?.sync();
    virtualHost?.sync();
    this.ensureHeartbeat();
    return true;
  }

  release(sessionId: string) {
    const h = this.hosted.get(sessionId);
    if (!h) return;
    h.authority.dispose();
    h.bots?.dispose();
    h.virtualHost?.dispose();
    this.hosted.delete(sessionId);
    this.locks.get(sessionId)?.();
    this.locks.delete(sessionId);
  }

  forget(sessionId: string) {
    this.release(sessionId);
    try {
      window.localStorage.removeItem(STORE_PREFIX + sessionId);
    } catch {
      /* ignore */
    }
    storageSet(
      INDEX_KEY,
      listStoredSessionIds().filter((id) => id !== sessionId),
    );
  }

  addListener(sessionId: string, listener: (e: GameEvent) => void) {
    const h = this.hosted.get(sessionId);
    if (!h) return () => undefined;
    h.listeners.add(listener);
    return () => void h.listeners.delete(listener);
  }

  /* ---------------------------------------------------------------- */
  /* Wire                                                              */
  /* ---------------------------------------------------------------- */

  /** Register an operation that remote tabs may call on the owning tab. */
  handle(op: string, fn: (hosted: Hosted, ...args: never[]) => unknown) {
    this.handlers.set(op, fn as (...args: never[]) => unknown);
  }

  post(message: WireMessage) {
    this.channel?.postMessage(message);
  }

  onWire(listener: (m: WireMessage) => void) {
    if (!this.channel) return () => undefined;
    const fn = (e: MessageEvent<WireMessage>) => listener(e.data);
    this.channel.addEventListener("message", fn);
    return () => this.channel?.removeEventListener("message", fn);
  }

  private onMessage(msg: WireMessage) {
    if (msg.t !== "req") return;
    const hosted = msg.target.sessionId
      ? this.hosted.get(msg.target.sessionId)
      : msg.target.roomCode
        ? this.findByRoom(msg.target.roomCode)
        : undefined;
    if (!hosted) return; // not ours; the owning tab (if any) will answer
    const fn = this.handlers.get(msg.op);
    if (!fn) {
      this.post({ t: "res", rid: msg.rid, ok: false, error: "unknown_op" });
      return;
    }
    try {
      const result = (fn as (h: Hosted, ...a: unknown[]) => unknown)(hosted, ...msg.args);
      this.post({ t: "res", rid: msg.rid, ok: true, result });
    } catch (err) {
      this.post({ t: "res", rid: msg.rid, ok: false, error: err instanceof Error ? err.message : "error" });
    }
  }

  private ensureHeartbeat() {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => {
      for (const h of this.hosted.values()) {
        this.post({ t: "alive", sessionId: h.authority.sessionId, roomCode: h.authority.roomCode });
      }
    }, HEARTBEAT_MS);
  }

  /* ---------------------------------------------------------------- */
  /* Single-owner lock                                                 */
  /* ---------------------------------------------------------------- */

  private locks = new Map<string, () => void>();

  private acquireLock(sessionId: string): Promise<boolean> {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (!locks) return Promise.resolve(true);
    return new Promise((resolve) => {
      void locks.request(`nq-host-${sessionId}`, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(false);
          return;
        }
        resolve(true);
        // Hold the lock until release() or the tab closes.
        return new Promise<void>((release) => this.locks.set(sessionId, release));
      });
    });
  }
}

let runtime: LocalRuntime | null = null;
export function getLocalRuntime(): LocalRuntime {
  runtime ??= new LocalRuntime();
  return runtime;
}
