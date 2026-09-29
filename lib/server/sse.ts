import "server-only";
import type { SessionSnapshot } from "@/lib/game/types";
import type { GameAuthority } from "@/lib/realtime/authority";
import type { GameEvent } from "@/lib/realtime/types";
import { RATE_LIMITS, rateLimit } from "@/lib/security/rate-limit";
import type { EventsBody } from "@/lib/validation/api";
import { getGameRuntime } from "./game-runtime";
import { hostAccess } from "./game-api";
import { getHost } from "./host-auth";
import { assertSameOrigin } from "./csrf";
import { result, type ApiResult } from "./http";

/**
 * Server-Sent Events for a live session (POST /api/sessions/[id]/events).
 *
 * The stream is read with fetch, not EventSource, so a player's token travels in the
 * POST body instead of a URL a proxy would log. Wire format:
 *
 *   data: {"type":"snapshot",...}\n\n    first frame, always a full snapshot
 *   data: <GameEvent JSON>\n\n           every event of the session afterwards
 *   : ping\n\n                           heartbeat every 15 s (clients drop a stream
 *                                        that stays silent for 35 s and reconnect)
 *
 * Player streams get their private `self` block in every snapshot (score, rank and
 * the answer they already locked in), so a refresh or a reconnect can never re-open
 * a question. Snapshots never carry correctness before the reveal: they come from
 * GameEngine.snapshotFor, which strips `isCorrect` from open questions.
 */

export const HEARTBEAT_MS = 15_000;

type ErrorBody = { ok: false; error: string };
const fail = (error: string, status: number): ApiResult<ErrorBody> => result({ ok: false, error }, status);
/** A client this far behind (frames queued, socket not draining) is cut loose; it reconnects to a fresh snapshot. */
const MAX_QUEUED_FRAMES = 256;

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  // no-transform: keeps compression middleware from buffering the stream.
  "Cache-Control": "no-cache, no-transform",
  // nginx: do not buffer (docs/DEPLOYMENT.md).
  "X-Accel-Buffering": "no",
} as const;

const encoder = new TextEncoder();

/** Each event is serialized once per process, however many streams receive it. */
const serialized = new WeakMap<object, string>();
function once(value: object): string {
  let text = serialized.get(value);
  if (text === undefined) {
    text = JSON.stringify(value);
    serialized.set(value, text);
  }
  return text;
}

function publicSnapshot(snapshot: SessionSnapshot): SessionSnapshot {
  if (!snapshot.self) return snapshot;
  const copy = { ...snapshot };
  delete copy.self;
  return copy;
}

/** One SSE frame. Player snapshots reuse the shared public JSON and append the player's own `self`. */
export function frameFor(event: GameEvent, authority: GameAuthority, playerId?: string): string {
  if (event.type !== "snapshot") return `data: ${once(event)}\n\n`;
  const pub = once(publicSnapshot(event.snapshot));
  const self = playerId ? authority.snapshot(playerId).self : undefined;
  const snapshot = self ? `${pub.slice(0, -1)},"self":${JSON.stringify(self)}}` : pub;
  return `data: {"type":"snapshot","snapshot":${snapshot}}\n\n`;
}

/** Starts the stream for an authorized viewer of a live session. */
export function eventStream(input: {
  sessionId: string;
  authority: GameAuthority;
  role: "host" | "player";
  playerId?: string;
  signal: AbortSignal;
}): Response {
  const { sessionId, authority, role, playerId, signal } = input;
  const runtime = getGameRuntime();
  let closed = false;
  let cleanup: () => void = () => undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed or errored */
        }
      };
      const write = (text: string) => {
        if (closed) return;
        if ((controller.desiredSize ?? 0) < -MAX_QUEUED_FRAMES) return close();
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          close();
        }
      };

      // First frame: where the session is right now (with `self` for a player).
      write(
        `data: ${JSON.stringify({ type: "snapshot", snapshot: authority.snapshot(playerId) } satisfies GameEvent)}\n\n`,
      );

      const unsubscribe = runtime.subscribe(sessionId, {
        role,
        playerId,
        send: (event) => write(frameFor(event, authority, playerId)),
        close,
      });
      const heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);
      const onAbort = () => close();
      signal.addEventListener("abort", onAbort, { once: true });
      cleanup = () => {
        clearInterval(heartbeat);
        signal.removeEventListener("abort", onAbort);
        unsubscribe();
      };
      if (signal.aborted) close();
    },
    cancel() {
      // The response pipe failed (client gone) before the abort signal fired.
      closed = true;
      cleanup();
    },
  });

  return new Response(stream, { status: 200, headers: SSE_HEADERS });
}

/**
 * POST /api/sessions/[id]/events. Players authenticate with { playerId, token };
 * an empty body is the host (cookie, same checks as the host commands).
 *   404 unknown session (or ended and already dropped) · 401 bad credentials ·
 *   403 kicked player / not this session's host · 429 reconnect storm ·
 *   503 the server is restarting (clients back off and meet the next process)
 */
export async function openSessionEvents(
  sessionId: string,
  body: EventsBody,
  request: Request,
  ip: string,
): Promise<Response | ApiResult<ErrorBody>> {
  // A stream opened now would be closed at once and the client would retry in a tight
  // loop; a plain error makes it back off until the restarted server answers.
  if (getGameRuntime().isShuttingDown) return { ...fail("server_restarting", 503), headers: { "Retry-After": "2" } };
  if (body.role === "player") {
    const live = getGameRuntime().get(sessionId);
    if (!live) return fail("not_found", 404);
    if (!live.authority.verify(body)) return fail("unauthorized", 401);
    // After authenticating: player ids are public, so forged requests must not spend this budget.
    if (!rateLimit(`events:${body.playerId}`, RATE_LIMITS.events)) return fail("rate_limited", 429);
    if (live.authority.engine.state.players[body.playerId]?.kicked) return fail("kicked", 403);
    return eventStream({
      sessionId,
      authority: live.authority,
      role: "player",
      playerId: body.playerId,
      signal: request.signal,
    });
  }

  // Host: cookie-authenticated, so only from our own pages.
  assertSameOrigin(request);
  if (!rateLimit(`events:host:${ip}`, RATE_LIMITS.events)) return fail("rate_limited", 429);
  const access = hostAccess(sessionId, await getHost(request));
  if (!access.ok) return access.res;
  return eventStream({ sessionId, authority: access.live.authority, role: "host", signal: request.signal });
}
