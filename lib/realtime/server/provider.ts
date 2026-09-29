/**
 * ServerRealtimeProvider: RealtimeGameProvider for the self-hosted game server.
 *
 * Commands are JSON POSTs to the route handlers under /api. Live events arrive over
 * a Server-Sent Events stream read with fetch (not EventSource), so the player's
 * token travels in the POST body instead of a URL that proxies would log. Every
 * (re)connection starts with a full snapshot, so recovering from a dropped mobile
 * connection is automatic.
 */

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

type HostCommand =
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
  | "end"
  | "lock"
  | "unlock"
  | "showLeaderboard"
  | "hideLeaderboard"
  | "kick";

/** Consider the stream dead if nothing (not even a heartbeat) arrives for this long. */
const STALE_MS = 35_000;
const BACKOFF_MS = [500, 1000, 2000, 4000, 5000];

/**
 * `errorBody`: "use" when the route answers errors in the success type's own shape
 * (JoinResult, RoomLookup, SubmitResult…), "fallback" when an error body is not a T
 * (a snapshot or a summary) and must never reach the UI as one.
 */
type ErrorBody = "use" | "fallback";

async function postJson<T>(url: string, body: unknown, fallback: T, errorBody: ErrorBody = "use"): Promise<T> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok && errorBody === "fallback") return fallback;
    const data = (await res.json().catch(() => null)) as T | null;
    return data ?? fallback;
  } catch {
    return fallback;
  }
}

async function getJson<T>(url: string, fallback: T, errorBody: ErrorBody = "use"): Promise<T> {
  try {
    const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) {
      if (errorBody === "fallback") return fallback;
      return ((await res.json().catch(() => null)) as T | null) ?? fallback;
    }
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

const enc = encodeURIComponent;
const creds = (c: PlayerCredentials) => ({ playerId: c.playerId, token: c.token });

export class ServerRealtimeProvider implements RealtimeGameProvider {
  readonly kind = "server" as const;

  /* ---- lookup ---- */

  resolveRoom(roomCode: string): Promise<RoomLookup> {
    return getJson<RoomLookup>(`/api/rooms/${enc(roomCode)}`, { status: "not_found" });
  }

  /* ---- host ---- */

  async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      credentials: "same-origin",
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({ error: "create_failed" }))).error ?? "create_failed");
    return (await res.json()) as CreateSessionResult;
  }

  private host(sessionId: string, command: HostCommand, playerId?: string) {
    return postJson<HostCommandResult>(
      `/api/sessions/${enc(sessionId)}/host`,
      { command, playerId },
      { ok: false, error: "network" },
    );
  }

  startGame = (id: string) => this.host(id, "start");
  publishQuestion = (id: string) => this.host(id, "publishQuestion");
  closeQuestion = (id: string) => this.host(id, "closeQuestion");
  publishResults = (id: string) => this.host(id, "publishResults");
  publishLeaderboard = (id: string) => this.host(id, "publishLeaderboard");
  nextQuestion = (id: string) => this.host(id, "next");
  finishGame = (id: string) => this.host(id, "finish");
  pauseGame = (id: string) => this.host(id, "pause");
  resumeGame = (id: string) => this.host(id, "resume");
  skipQuestion = (id: string) => this.host(id, "skip");
  endSession = (id: string) => this.host(id, "end");
  setJoinsLocked = (id: string, locked: boolean) => this.host(id, locked ? "lock" : "unlock");
  setLeaderboardVisible = (id: string, visible: boolean) =>
    this.host(id, visible ? "showLeaderboard" : "hideLeaderboard");
  kickPlayer = (id: string, playerId: string) => this.host(id, "kick", playerId);

  /* ---- player ---- */

  joinSession(input: { roomCode: string; nickname: string; avatarSeed: string }): Promise<JoinResult> {
    return postJson<JoinResult>(
      `/api/rooms/${enc(input.roomCode)}/join`,
      { nickname: input.nickname, avatarSeed: input.avatarSeed },
      { ok: false, error: "network" },
    );
  }

  resumePlayer(c: PlayerCredentials): Promise<ResumeResult> {
    return postJson<ResumeResult>(
      `/api/sessions/${enc(c.sessionId)}/player`,
      { action: "resume", ...creds(c) },
      { ok: false, error: "network" },
    );
  }

  async leaveSession(c: PlayerCredentials): Promise<void> {
    await postJson(`/api/sessions/${enc(c.sessionId)}/player`, { action: "leave", ...creds(c) }, null);
  }

  submitAnswer(c: PlayerCredentials, questionId: string, payload: AnswerPayload): Promise<SubmitResult> {
    return postJson<SubmitResult>(
      `/api/sessions/${enc(c.sessionId)}/answer`,
      { ...creds(c), questionId, payload },
      { status: "invalid", reason: "network" },
    );
  }

  getSummary(c: PlayerCredentials): Promise<PlayerSummary | null> {
    return postJson<PlayerSummary | null>(
      `/api/sessions/${enc(c.sessionId)}/player`,
      { action: "summary", ...creds(c) },
      null,
      "fallback",
    );
  }

  /* ---- live ---- */

  getSnapshot(sessionId: string, role: Role): Promise<SessionSnapshot | null> {
    if (role.kind === "host")
      return getJson<SessionSnapshot | null>(`/api/sessions/${enc(sessionId)}/state`, null, "fallback");
    return postJson<SessionSnapshot | null>(
      `/api/sessions/${enc(sessionId)}/player`,
      { action: "snapshot", ...creds(role.credentials) },
      null,
      "fallback",
    );
  }

  subscribe(
    sessionId: string,
    role: Role,
    onEvent: (event: GameEvent) => void,
    onStatus?: (status: ConnectionStatus) => void,
  ): Unsubscribe {
    let disposed = false;
    let attempt = 0;
    /** Bumped by every connect(): a superseded attempt must not schedule retries of its own. */
    let generation = 0;
    let controller: AbortController | null = null;
    let staleTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let status: ConnectionStatus | null = null;

    const setStatus = (next: ConnectionStatus) => {
      if (next === status) return;
      status = next;
      onStatus?.(next);
    };

    const armStale = () => {
      if (staleTimer) clearTimeout(staleTimer);
      staleTimer = setTimeout(() => controller?.abort(), STALE_MS);
    };

    const connect = async () => {
      if (disposed) return;
      const gen = ++generation;
      if (staleTimer) clearTimeout(staleTimer);
      controller = new AbortController();
      setStatus(attempt === 0 ? "connecting" : attempt > 3 ? "offline" : "reconnecting");
      try {
        const res = await fetch(`/api/sessions/${enc(sessionId)}/events`, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "text/event-stream" },
          body: JSON.stringify(role.kind === "player" ? creds(role.credentials) : {}),
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          // 401/404/410: the session or identity is gone; tell the UI via a terminal event.
          if (res.status === 404 || res.status === 410) onEvent({ type: "session.ended", reason: "expired" });
          if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 410) {
            setStatus("offline");
            return;
          }
          throw new Error(`stream ${res.status}`);
        }
        armStale();
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          armStale();
          buffer += value;
          let sep: number;
          while ((sep = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            const data = frame
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n");
            if (!data) continue; // heartbeat comment
            try {
              const event = JSON.parse(data) as GameEvent;
              attempt = 0;
              setStatus("online");
              onEvent(event);
            } catch {
              /* malformed frame: ignore */
            }
          }
        }
        throw new Error("stream closed");
      } catch {
        // Unsubscribed, or replaced by a newer attempt (e.g. the device came back online).
        if (disposed || gen !== generation) return;
        if (staleTimer) clearTimeout(staleTimer);
        attempt += 1;
        setStatus(attempt > 3 ? "offline" : "reconnecting");
        retryTimer = setTimeout(() => void connect(), BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)]);
      }
    };

    const onOnline = () => {
      if (disposed) return;
      if (retryTimer) clearTimeout(retryTimer);
      if (staleTimer) clearTimeout(staleTimer);
      controller?.abort();
      attempt = 1;
      void connect();
    };
    window.addEventListener("online", onOnline);

    void connect();

    return () => {
      disposed = true;
      window.removeEventListener("online", onOnline);
      if (staleTimer) clearTimeout(staleTimer);
      if (retryTimer) clearTimeout(retryTimer);
      controller?.abort();
    };
  }
}
