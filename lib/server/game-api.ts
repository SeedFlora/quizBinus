import "server-only";
import type { EngineState, JoinError } from "@/lib/game/engine";
import { validateQuiz } from "@/lib/quiz/schema";
import type { PlayerSummary, Quiz, SessionSnapshot, SubmitResult } from "@/lib/game/types";
import { DEMO_ROOM_CODE, DEMO_SESSION_ID } from "@/lib/demo/simulate";
import { DEMO_LECTURER, OS_BATTLE } from "@/lib/seed/quizzes";
import { isDatabaseConfigured } from "@/lib/env.server";
import { getQuiz } from "@/lib/db/quizzes";
import { getSessionEngineState, listHostSessions, type SessionListItem } from "@/lib/db/reports";
import type { GameAuthority } from "@/lib/realtime/authority";
import type {
  CreateSessionResult,
  HostCommandResult,
  JoinResult,
  PlayerCredentials,
  ResumeResult,
  RoomLookup,
} from "@/lib/realtime/types";
import { RATE_LIMITS, rateLimit } from "@/lib/security/rate-limit";
import type { AnswerBody, CreateSessionBody, HostCommandBody, JoinBody, PlayerActionBody } from "@/lib/validation/api";
import { getGameRuntime, type Live } from "./game-runtime";
import { canHost, issueHostKey, type HostIdentity } from "./host-auth";
import { result, type ApiResult } from "./http";

/**
 * The game API: every route handler under app/api/rooms and app/api/sessions is a
 * thin wrapper around one function here. Each returns { status, body } (and headers
 * when a cookie is set), so the whole lifecycle is testable without HTTP.
 *
 * The authority is always the in-process ServerGameRuntime (lib/server/game-runtime.ts);
 * PostgreSQL (database mode) only stores quizzes and writes sessions behind.
 */

type ErrorBody = { ok: false; error: string };
const fail = (error: string, status: number): ApiResult<ErrorBody> => result({ ok: false, error }, status);

/** Live sessions per process: a campus needs a few dozen; also caps memory-mode abuse. */
const MAX_LIVE_SESSIONS = 200;
/** The shared server demo: the flagship quiz and a simulated class. */
const DEMO_BOTS = { count: 41, joinEvery: 700 };
const DEMO_HOST_NAME = `${DEMO_LECTURER.salutation} ${DEMO_LECTURER.fullName}`;

/* ------------------------------------------------------------------ */
/* Player: lookup + join                                               */
/* ------------------------------------------------------------------ */

const LOOKUP_STATUS: Record<RoomLookup["status"], number> = {
  ok: 200,
  not_found: 404,
  ended: 410,
  full: 409,
  locked: 423,
  rate_limited: 429,
};

/**
 * Server-wide budget for PINs that match no live room (lookups and joins share it).
 * Only misses count: guessing PINs with spoofed addresses stays bounded, but a flood of
 * guesses can never lock out the students who type a real PIN.
 */
function missAllowed(): boolean {
  return rateLimit("room:miss", RATE_LIMITS.roomMisses);
}

export function lookupRoom(code: string, ip: string): ApiResult<RoomLookup> {
  if (!rateLimit(`lookup:ip:${ip}`, RATE_LIMITS.lookup)) return result({ status: "rate_limited" }, 429);
  const runtime = getGameRuntime();
  const live = runtime.findByRoom(code);
  if (!live) {
    if (!missAllowed()) return result({ status: "rate_limited" }, 429);
    // An ended demo is simply "not running": clients then fall back to the offline solo demo.
    const ended = code !== DEMO_ROOM_CODE && runtime.findEndedByRoom(code);
    return ended ? result({ status: "ended" }, 410) : result({ status: "not_found" }, 404);
  }
  const lookup = live.authority.lookup();
  return result(lookup, LOOKUP_STATUS[lookup.status]);
}

const JOIN_ERROR_STATUS: Record<JoinError, number> = {
  not_found: 404,
  ended: 410,
  locked: 423,
  full: 409,
  nickname_taken: 409,
  kicked: 403,
};

export function joinRoom(code: string, body: JoinBody, ip: string): ApiResult<JoinResult> {
  if (!rateLimit(`join:ip:${ip}`, RATE_LIMITS.join)) return result({ ok: false, error: "rate_limited" }, 429);
  const live = getGameRuntime().findByRoom(code);
  if (!live) {
    return missAllowed()
      ? result({ ok: false, error: "not_found" }, 404)
      : result({ ok: false, error: "rate_limited" }, 429);
  }
  // Per room, not per server: join spam aimed at one class never blocks the others.
  if (!rateLimit(`join:room:${live.authority.sessionId}`, RATE_LIMITS.joinPerRoom)) {
    return result({ ok: false, error: "rate_limited" }, 429);
  }
  // Sanitizing, lock, capacity and unique nicknames: the same rules as every transport.
  const joined = live.authority.join({ nickname: body.nickname, avatarSeed: body.avatarSeed });
  if (joined.ok) return result(joined, 201);
  const status =
    joined.error === "invalid_nickname" || joined.error === "blocked_nickname"
      ? 422
      : joined.error === "rate_limited"
        ? 429
        : joined.error === "network"
          ? 503
          : JOIN_ERROR_STATUS[joined.error];
  return result(joined, status);
}

/* ------------------------------------------------------------------ */
/* Player: resume / leave / snapshot / summary / answer                */
/* ------------------------------------------------------------------ */

/** The authority only reads playerId + token from credentials; the rest is filled in for the type. */
function credentialsFor(authority: GameAuthority, auth: { playerId: string; token: string }): PlayerCredentials {
  return {
    sessionId: authority.sessionId,
    roomCode: authority.roomCode,
    playerId: auth.playerId,
    token: auth.token,
    nickname: "",
    avatarSeed: "",
  };
}

type PlayerActionResponse = ResumeResult | { ok: true } | SessionSnapshot | PlayerSummary | ErrorBody;

export function playerAction(sessionId: string, body: PlayerActionBody): ApiResult<PlayerActionResponse> {
  const live = getGameRuntime().get(sessionId);
  if (!live) return fail(body.action === "resume" ? "ended" : "not_found", 404);
  const { authority } = live;
  const credentials = credentialsFor(authority, body);
  // Unknown player or wrong token: indistinguishable on purpose.
  if (!authority.verify(credentials)) return fail("not_found", 401);
  // Player ids are public (every snapshot lists them), so the per-player budget is only
  // spent by the player's own authenticated requests, never by a classmate's forgeries.
  if (!rateLimit(`player:${body.playerId}`, RATE_LIMITS.player)) return fail("rate_limited", 429);

  switch (body.action) {
    case "resume": {
      const resumed = authority.resume(credentials);
      if (resumed.ok) return result(resumed);
      return result(resumed, resumed.error === "kicked" ? 403 : 404);
    }
    case "snapshot":
      return result(authority.snapshot(body.playerId));
    case "summary": {
      const summary = authority.summary(credentials);
      return summary ? result(summary) : fail("not_found", 404);
    }
    case "leave":
      authority.leave(credentials);
      return result({ ok: true as const });
  }
}

type AnswerResponse = SubmitResult | (SubmitResult & { error: string });

export function submitAnswer(sessionId: string, body: AnswerBody): ApiResult<AnswerResponse> {
  const live = getGameRuntime().get(sessionId);
  if (!live) return result({ status: "not_open", error: "not_found" }, 404);
  const credentials = credentialsFor(live.authority, body);
  // Authenticate before touching the per-player budget: player ids are public, and a
  // forged request must not use up a classmate's answer allowance.
  if (!live.authority.verify(credentials)) return result({ status: "invalid", reason: "unauthorized" }, 401);
  if (!rateLimit(`answer:${body.playerId}`, RATE_LIMITS.answer)) {
    return result({ status: "invalid", reason: "rate_limited", error: "rate_limited" }, 429);
  }
  // Time, correctness and points come from the server clock and the engine only.
  const res = live.authority.submit(credentials, body.questionId, body.payload);
  switch (res.status) {
    case "accepted":
      return result(res);
    case "duplicate":
    case "late":
    case "not_open":
      return result(res, 409);
    case "invalid":
      return result(res, res.reason === "unauthorized" ? 401 : res.reason === "unknown_player" ? 403 : 422);
  }
}

/* ------------------------------------------------------------------ */
/* Host: create + list                                                 */
/* ------------------------------------------------------------------ */

export async function createSession(
  host: HostIdentity | null,
  body: CreateSessionBody,
  request: Request,
  ip: string,
): Promise<ApiResult<CreateSessionResult | ErrorBody>> {
  if (!host) return fail("unauthorized", 401);
  // Memory mode has one shared "lecturer", so the budget is per address there.
  const bucket = host.mode === "database" ? host.id : `ip:${ip}`;
  if (!rateLimit(`session:${bucket}`, RATE_LIMITS.createSession)) return fail("rate_limited", 429);

  let quiz: Quiz | null;
  if (host.mode === "database") {
    // Stored quizzes only: the inline copy (if any) is ignored, so a lecturer can only
    // host what they own, exactly as saved.
    quiz = await getQuiz(body.quizId, host.id);
  } else {
    // Memory mode: quizzes live in the lecturer's browser and arrive inline.
    quiz = body.quiz && body.quiz.id === body.quizId ? body.quiz : null;
  }
  if (!quiz) return fail("quiz_not_found", 404);
  if (!validateQuiz(quiz).ready) return fail("quiz_not_ready", 422);

  const runtime = getGameRuntime();
  if (runtime.stats().sessions >= MAX_LIVE_SESSIONS) return fail("server_busy", 503);

  const key = host.mode === "memory" ? issueHostKey(request, host) : null;
  const created = await runtime.createSession(
    quiz,
    { id: host.id, displayName: host.displayName },
    key ? { hostKeyHash: key.hash } : {},
  );
  return result(created, 201, key?.setCookie ? { "Set-Cookie": key.setCookie } : undefined);
}

export type SessionStatus = "lobby" | "running" | "finished" | "ended";

function statusOf(live: Live): SessionStatus {
  const phase = live.authority.engine.state.phase;
  if (phase === "lobby") return "lobby";
  if (phase === "finished" || phase === "ended") return phase;
  return "running";
}

/** Correct / answered over revealed, scored questions (the rule lib/db/reports.ts applies in SQL). */
function accuracyOf(state: EngineState): number | null {
  let answered = 0;
  let correct = 0;
  for (const q of state.quiz.questions) {
    const reveal = state.reveals[q.id];
    if (!reveal || q.type === "poll" || q.points <= 0) continue;
    answered += reveal.stats.answered;
    correct += reveal.stats.correct;
  }
  return answered > 0 ? correct / answered : null;
}

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

/** A live session as a session-list row (same shape as the database report rows). */
function liveListItem(sessionId: string, live: Live): SessionListItem {
  const s = live.authority.engine.state;
  return {
    id: sessionId,
    quizId: live.meta.quizId,
    quizTitle: s.quiz.title,
    courseCode: s.quiz.course.courseCode,
    roomCode: s.roomCode,
    status: statusOf(live),
    players: live.authority.engine.activePlayers().length,
    accuracy: accuracyOf(s),
    startedAt: iso(s.startedAt),
    endedAt: iso(s.endedAt),
    createdAt: iso(s.createdAt)!,
  };
}

export async function listSessions(host: HostIdentity | null): Promise<ApiResult<SessionListItem[] | ErrorBody>> {
  if (!host) return fail("unauthorized", 401);
  const runtime = getGameRuntime();
  const mine = runtime
    .list()
    .filter(([id, live]) => id !== DEMO_SESSION_ID && canHost(id, live.meta, host))
    .map(([id, live]) => liveListItem(id, live));

  if (host.mode === "memory") {
    return result(mine.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }
  // Database rows are the history; live sessions overlay their current status and head count.
  const liveById = new Map(mine.map((item) => [item.id, item]));
  const stored = await listHostSessions(host.id);
  const merged = stored.map((row) => liveById.get(row.id) ?? row);
  const storedIds = new Set(stored.map((row) => row.id));
  const unsaved = mine.filter((item) => !storedIds.has(item.id));
  return result([...unsaved, ...merged]);
}

/* ------------------------------------------------------------------ */
/* Host: state, commands, report                                       */
/* ------------------------------------------------------------------ */

export type HostAccess = { ok: true; live: Live } | { ok: false; res: ApiResult<ErrorBody> };

/** 401 without an identity (database mode, signed out), 404 unknown session, 403 not yours. */
export function hostAccess(sessionId: string, host: HostIdentity | null): HostAccess {
  const demoOpen = sessionId === DEMO_SESSION_ID && !isDatabaseConfigured();
  if (!host && !demoOpen) return { ok: false, res: fail("unauthorized", 401) };
  const live = getGameRuntime().get(sessionId);
  if (!live) return { ok: false, res: fail("not_found", 404) };
  if (!canHost(sessionId, live.meta, host)) return { ok: false, res: fail("forbidden", 403) };
  return { ok: true, live };
}

export function hostState(sessionId: string, host: HostIdentity | null): ApiResult<SessionSnapshot | ErrorBody> {
  const access = hostAccess(sessionId, host);
  if (!access.ok) return access.res;
  return result(access.live.authority.snapshot());
}

const TRANSITION_STATUS: Record<string, number> = { invalid_phase: 409, not_found: 404, no_questions: 422 };

export function hostCommand(
  sessionId: string,
  host: HostIdentity | null,
  body: HostCommandBody,
): ApiResult<HostCommandResult | ErrorBody> {
  const access = hostAccess(sessionId, host);
  if (!access.ok) return access.res;
  if (!rateLimit(`host:${host?.id ?? "demo"}:${sessionId}`, RATE_LIMITS.host)) return fail("rate_limited", 429);
  const a = access.live.authority;
  const res = ((): HostCommandResult => {
    switch (body.command) {
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
      case "lock":
        return a.setJoinsLocked(true);
      case "unlock":
        return a.setJoinsLocked(false);
      case "showLeaderboard":
        return a.setLeaderboardVisible(true);
      case "hideLeaderboard":
        return a.setLeaderboardVisible(false);
      case "kick":
        // The schema guarantees playerId for "kick".
        return a.kick(body.playerId ?? "");
    }
  })();
  if (res.ok) return result(res);
  return result(res, TRANSITION_STATUS[res.error ?? ""] ?? 409);
}

/** Full engine state (answers, reveals, correctness) for the host's analytics. */
export async function sessionReport(
  sessionId: string,
  host: HostIdentity | null,
): Promise<ApiResult<EngineState | ErrorBody>> {
  const access = hostAccess(sessionId, host);
  if (access.ok) return result(access.live.authority.engine.serialize());
  // Not in memory any more (finished and swept, or a restart): the stored copy.
  if (access.res.status === 404 && host?.mode === "database" && sessionId !== DEMO_SESSION_ID) {
    const stored = await getSessionEngineState(sessionId, host.id);
    if (stored) return result(stored);
  }
  return access.res;
}

/* ------------------------------------------------------------------ */
/* The shared server demo                                              */
/* ------------------------------------------------------------------ */

const globalForDemo = globalThis as unknown as { __nqDemoPending?: Promise<CreateSessionResult> | null };

/**
 * Makes sure the shared demo (session "demo", PIN 482913, 41 simulated students) is
 * running and returns it. A finished or ended demo is replaced by a fresh one; a
 * running one is reused, so every projector and phone on the network meets in the
 * same room. Never persisted (lib/server/game-runtime.ts).
 */
export async function ensureDemoSession(ip: string): Promise<ApiResult<CreateSessionResult | ErrorBody>> {
  if (!rateLimit(`demo:ip:${ip}`, RATE_LIMITS.demo)) return fail("rate_limited", 429);
  const runtime = getGameRuntime();
  const existing = runtime.get(DEMO_SESSION_ID);
  if (existing && statusOf(existing) !== "finished" && statusOf(existing) !== "ended") {
    return result({ sessionId: DEMO_SESSION_ID, roomCode: existing.authority.roomCode });
  }
  // Concurrent first visits share one creation instead of racing two demos into the map.
  let pending = globalForDemo.__nqDemoPending;
  if (!pending) {
    runtime.drop(DEMO_SESSION_ID);
    pending = runtime.createSession(
      OS_BATTLE,
      { id: DEMO_LECTURER.id, displayName: DEMO_HOST_NAME },
      { sessionId: DEMO_SESSION_ID, roomCode: DEMO_ROOM_CODE, bots: DEMO_BOTS },
    );
    globalForDemo.__nqDemoPending = pending;
    const settled = pending;
    void settled
      .finally(() => {
        if (globalForDemo.__nqDemoPending === settled) globalForDemo.__nqDemoPending = null;
      })
      .catch(() => undefined);
  }
  return result(await pending);
}
