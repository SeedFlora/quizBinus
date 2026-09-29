import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameAuthority, type AuthorityOptions, type PersistedAuthority } from "@/lib/realtime/authority";
import { GameEngine } from "@/lib/game/engine";
import type { AnswerPayload, Question } from "@/lib/game/types";
import type { GameEvent, PlayerCredentials } from "@/lib/realtime/types";
import { sha256Hex } from "@/lib/security/sha256";
import { question, quiz } from "../../fixtures/quiz";

const T0 = Date.UTC(2026, 8, 28, 2, 0, 0);
const GRACE = 750;

function freshState(questions: Question[], maxPlayers?: number): PersistedAuthority {
  const engine = GameEngine.create({
    sessionId: "sess-1",
    roomCode: "482913",
    hostName: "Bu Laras",
    quiz: quiz(questions),
    now: Date.now(),
    maxPlayers,
    graceMs: GRACE,
  });
  return { engine: engine.serialize(), tokens: {} };
}

function setup(
  questions: Question[] = [question("single", { id: "q1" }), question("single", { id: "q2" })],
  options: Partial<AuthorityOptions> & { maxPlayers?: number; persisted?: PersistedAuthority } = {},
) {
  const events: GameEvent[] = [];
  const onChange = vi.fn();
  const { maxPlayers, persisted, ...rest } = options;
  const authority = new GameAuthority(persisted ?? freshState(questions, maxPlayers), {
    onEvent: (e) => events.push(e),
    onChange,
    ...rest,
  });
  authorities.push(authority);
  return { authority, events, onChange };
}

function join(authority: GameAuthority, nickname: string): PlayerCredentials {
  const res = authority.join({ nickname, avatarSeed: `seed-${nickname}` });
  if (!res.ok) throw new Error(`join failed: ${res.error}`);
  return res.credentials;
}

const correctFor = (a: GameAuthority): AnswerPayload => {
  const q = a.engine.currentQuestion!;
  return { kind: "choice", answerIds: [q.answers.find((x) => x.isCorrect)!.id] };
};

const types = (events: GameEvent[]) => events.map((e) => e.type);
const lastSnapshot = (events: GameEvent[]) => {
  const snaps = events.filter((e): e is Extract<GameEvent, { type: "snapshot" }> => e.type === "snapshot");
  return snaps.at(-1)?.snapshot;
};

const authorities: GameAuthority[] = [];

beforeEach(() => {
  vi.useFakeTimers({ now: T0 });
});

afterEach(() => {
  authorities.splice(0).forEach((a) => a.dispose());
  vi.useRealTimers();
});

/* ------------------------------------------------------------------ */

describe("GameAuthority: joining and tokens", () => {
  it("issues credentials with an opaque url-safe token and a personal snapshot", () => {
    const { authority, events, onChange } = setup();
    const res = authority.join({ nickname: "  <b>Rara</b>  ", avatarSeed: "abc" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.credentials).toMatchObject({
      sessionId: "sess-1",
      roomCode: "482913",
      nickname: "Rara",
      avatarSeed: "abc",
    });
    expect(res.credentials.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.snapshot.self?.playerId).toBe(res.credentials.playerId);
    expect(events).toEqual([
      {
        type: "player.joined",
        player: { id: res.credentials.playerId, nickname: "Rara", avatarSeed: "abc" },
        playerCount: 1,
      },
    ]);
    expect(onChange).toHaveBeenCalledTimes(1);
    // Only the token's sha256 is persisted (lib/security/sha256.ts).
    expect(onChange.mock.calls[0]![0].tokens[res.credentials.playerId]).toBe(sha256Hex(res.credentials.token));
  });

  it("maps nickname problems to join errors", () => {
    const { authority } = setup();
    join(authority, "Rara");
    expect(authority.join({ nickname: "x", avatarSeed: "s" })).toEqual({ ok: false, error: "invalid_nickname" });
    expect(authority.join({ nickname: "bangsat", avatarSeed: "s" })).toEqual({ ok: false, error: "blocked_nickname" });
    expect(authority.join({ nickname: "RARA", avatarSeed: "s" })).toEqual({ ok: false, error: "nickname_taken" });
  });

  it("bounds the avatar seed and falls back to the nickname", () => {
    const { authority } = setup();
    const long = authority.join({ nickname: "Bima", avatarSeed: "x".repeat(200) });
    expect(long.ok && long.credentials.avatarSeed).toHaveLength(64);
    const empty = authority.join({ nickname: "Dewi", avatarSeed: "" });
    expect(empty.ok && empty.credentials.avatarSeed).toBe("Dewi");
  });

  it("verifies tokens exactly", () => {
    const { authority } = setup();
    const c = join(authority, "Rara");
    expect(authority.verify(c)).toBe(true);
    expect(authority.verify({ ...c, token: `${c.token}x` })).toBe(false);
    expect(authority.verify({ ...c, token: "" })).toBe(false);
    expect(authority.verify({ playerId: "ghost", token: c.token })).toBe(false);
  });

  it("resume: valid token → personal snapshot, marks the player connected", () => {
    const { authority } = setup();
    const c = join(authority, "Rara");
    authority.engine.setConnected(c.playerId, false);
    const res = authority.resume(c);
    expect(res.ok && res.snapshot.self?.nickname).toBe("Rara");
    expect(authority.engine.state.players[c.playerId]!.connected).toBe(true);
    expect(authority.resume({ ...c, token: "forged" })).toEqual({ ok: false, error: "not_found" });
  });

  it("resume after a kick is refused", () => {
    const { authority } = setup();
    const c = join(authority, "Rara");
    authority.kick(c.playerId);
    expect(authority.resume(c)).toEqual({ ok: false, error: "kicked" });
  });

  it("lookup reflects room status: ok, locked, full, ended", () => {
    const { authority } = setup(undefined, { maxPlayers: 2 });
    expect(authority.lookup()).toMatchObject({
      status: "ok",
      roomCode: "482913",
      quizTitle: "Kuis Uji",
      playerCount: 0,
    });
    join(authority, "Rara");
    authority.setJoinsLocked(true);
    expect(authority.lookup()).toEqual({ status: "locked" });
    expect(authority.join({ nickname: "Bima", avatarSeed: "b" })).toEqual({ ok: false, error: "locked" });
    authority.setJoinsLocked(false);
    join(authority, "Bima");
    expect(authority.lookup()).toEqual({ status: "full" });
    authority.end();
    expect(authority.lookup()).toEqual({ status: "ended" });
  });

  it("leave in the lobby frees the seat and tells everyone", () => {
    const { authority, events } = setup();
    const c = join(authority, "Rara");
    authority.leave({ ...c, token: "forged" }); // ignored
    expect(authority.engine.state.players[c.playerId]).toBeDefined();
    authority.leave(c);
    expect(authority.engine.state.players[c.playerId]).toBeUndefined();
    expect(events.at(-2)).toEqual({ type: "player.left", playerId: c.playerId, playerCount: 0 });
    expect(events.at(-1)?.type).toBe("snapshot");
  });
});

/* ------------------------------------------------------------------ */

describe("GameAuthority: answers", () => {
  it("rejects submissions without a valid token", () => {
    const { authority } = setup();
    const c = join(authority, "Rara");
    authority.start();
    authority.publishQuestion();
    expect(authority.submit({ ...c, token: "forged" }, "q1", correctFor(authority))).toEqual({
      status: "invalid",
      reason: "unauthorized",
    });
  });

  it("accepts once, emits progress, and dedupes repeats", () => {
    const { authority, events } = setup();
    const a = join(authority, "Rara");
    join(authority, "Bima");
    authority.start();
    authority.publishQuestion();
    events.length = 0;

    vi.advanceTimersByTime(2_000);
    expect(authority.submit(a, "q1", correctFor(authority))).toEqual({ status: "accepted", responseTimeMs: 2_000 });
    expect(events).toEqual([{ type: "progress", questionId: "q1", answered: 1, total: 2 }]);
    expect(authority.submit(a, "q1", correctFor(authority))).toEqual({ status: "duplicate" });
    expect(events).toHaveLength(1);
  });

  it("auto-closes shortly after every connected player has answered", () => {
    const { authority, events } = setup();
    const a = join(authority, "Rara");
    const b = join(authority, "Bima");
    authority.start();
    authority.publishQuestion();
    authority.submit(a, "q1", correctFor(authority));
    authority.submit(b, "q1", correctFor(authority));
    expect(authority.engine.state.phase).toBe("question");
    vi.advanceTimersByTime(899);
    expect(authority.engine.state.phase).toBe("question");
    vi.advanceTimersByTime(1);
    expect(authority.engine.state.phase).toBe("reveal");
    expect(lastSnapshot(events)?.reveal?.questionId).toBe("q1");
  });

  it("does not auto-close early when disabled", () => {
    const { authority } = setup(undefined, { autoCloseWhenAllAnswered: false });
    const a = join(authority, "Rara");
    authority.start();
    authority.publishQuestion();
    authority.submit(a, "q1", correctFor(authority));
    vi.advanceTimersByTime(5_000);
    expect(authority.engine.state.phase).toBe("question");
  });

  it("auto-closes at the deadline plus the network grace", () => {
    const { authority, events } = setup();
    join(authority, "Rara");
    authority.start();
    authority.publishQuestion(); // 20 s limit
    vi.advanceTimersByTime(20_000 + GRACE - 1);
    expect(authority.engine.state.phase).toBe("question");
    vi.advanceTimersByTime(1);
    expect(authority.engine.state.phase).toBe("reveal");
    expect(lastSnapshot(events)?.phase).toBe("reveal");
  });

  it("a pause stops the deadline timer; resume re-arms it with the remaining time", () => {
    const { authority } = setup();
    join(authority, "Rara");
    authority.start();
    authority.publishQuestion();
    vi.advanceTimersByTime(5_000);
    authority.pauseGame();
    vi.advanceTimersByTime(120_000);
    expect(authority.engine.state.phase).toBe("question");
    authority.resumeGame();
    vi.advanceTimersByTime(15_000 + GRACE - 1);
    expect(authority.engine.state.phase).toBe("question");
    vi.advanceTimersByTime(1);
    expect(authority.engine.state.phase).toBe("reveal");
  });

  it("a manual close cancels the pending all-answered close", () => {
    const { authority } = setup();
    const a = join(authority, "Rara");
    authority.start();
    authority.publishQuestion();
    authority.submit(a, "q1", correctFor(authority));
    expect(authority.closeQuestion().ok).toBe(true);
    authority.next();
    authority.publishQuestion();
    vi.advanceTimersByTime(1_000); // the old 900 ms timer must not close q2
    expect(authority.engine.state).toMatchObject({ phase: "question", questionIndex: 1 });
  });

  it("re-arms the deadline timer when restored mid-question (host refresh)", () => {
    const first = setup();
    join(first.authority, "Rara");
    first.authority.start();
    first.authority.publishQuestion();
    vi.advanceTimersByTime(10_000);
    const persisted = first.authority.persisted();
    first.authority.dispose();

    const { authority } = setup(undefined, { persisted });
    vi.advanceTimersByTime(10_000 + GRACE - 1);
    expect(authority.engine.state.phase).toBe("question");
    vi.advanceTimersByTime(1);
    expect(authority.engine.state.phase).toBe("reveal");
  });

  it("dispose stops all timers", () => {
    const { authority } = setup();
    join(authority, "Rara");
    authority.start();
    authority.publishQuestion();
    authority.dispose();
    vi.advanceTimersByTime(60_000);
    expect(authority.engine.state.phase).toBe("question");
  });

  it("bots answer through the same path", () => {
    const { authority } = setup();
    expect(authority.addBot({ id: "demo-1", nickname: "Bot Satu", avatarSeed: "b" })).toBe(true);
    expect(authority.addBot({ id: "demo-2", nickname: "bot satu", avatarSeed: "b" })).toBe(false);
    authority.start();
    authority.publishQuestion();
    expect(authority.submitAsBot("demo-1", "q1", correctFor(authority)).status).toBe("accepted");
    expect(authority.submitAsBot("demo-9", "q1", correctFor(authority))).toEqual({
      status: "invalid",
      reason: "unknown_player",
    });
  });
});

/* ------------------------------------------------------------------ */

describe("GameAuthority: host commands", () => {
  it("runs the full flow, broadcasting a snapshot after every transition", () => {
    const { authority, events } = setup();
    const a = join(authority, "Rara");
    events.length = 0;

    const start = authority.start();
    expect(start).toMatchObject({ ok: true, snapshot: { phase: "intro" } });
    expect(start.snapshot?.self).toBeUndefined(); // host view
    expect(authority.publishQuestion()).toMatchObject({ ok: true, snapshot: { phase: "question" } });
    authority.submit(a, "q1", correctFor(authority));
    expect(authority.closeQuestion()).toMatchObject({ ok: true, snapshot: { phase: "reveal" } });
    expect(authority.publishResults()).toMatchObject({ ok: true, snapshot: { phase: "reveal" } });
    expect(authority.publishLeaderboard()).toMatchObject({ ok: true, snapshot: { phase: "leaderboard" } });
    expect(authority.next()).toMatchObject({ ok: true, snapshot: { phase: "intro", questionIndex: 1 } });
    expect(authority.skip()).toMatchObject({ ok: true, snapshot: { phase: "finished" } });

    expect(types(events)).toEqual([
      "snapshot", // start
      "snapshot", // publishQuestion
      "progress",
      "snapshot", // close
      "snapshot", // publishResults (idempotent re-broadcast)
      "snapshot", // leaderboard
      "snapshot", // next
      "snapshot", // skip → finished
    ]);
  });

  it("returns invalid_phase without broadcasting for out-of-order commands", () => {
    const { authority, events } = setup();
    join(authority, "Rara");
    events.length = 0;
    expect(authority.publishQuestion()).toEqual({ ok: false, error: "invalid_phase" });
    expect(authority.closeQuestion()).toEqual({ ok: false, error: "invalid_phase" });
    expect(authority.publishResults()).toEqual({ ok: false, error: "invalid_phase" });
    expect(authority.publishLeaderboard()).toEqual({ ok: false, error: "invalid_phase" });
    expect(authority.next()).toEqual({ ok: false, error: "invalid_phase" });
    expect(authority.pauseGame()).toEqual({ ok: false, error: "invalid_phase" });
    expect(events).toEqual([]);
  });

  it("finish and end announce the session end", () => {
    const finished = setup();
    finished.authority.start();
    expect(finished.authority.finish().ok).toBe(true);
    expect(finished.events.at(-1)).toEqual({ type: "session.ended", reason: "finished" });

    const ended = setup();
    join(ended.authority, "Rara");
    ended.authority.start();
    ended.authority.publishQuestion();
    expect(ended.authority.end()).toMatchObject({ ok: true, snapshot: { phase: "ended", endedReason: "host_ended" } });
    expect(ended.events.at(-1)).toEqual({ type: "session.ended", reason: "host_ended" });
    expect(ended.authority.end()).toEqual({ ok: false, error: "invalid_phase" });
  });

  it("kick emits player.kicked, then a snapshot without the player; the kicked token is useless", () => {
    const { authority, events } = setup();
    const a = join(authority, "Rara");
    join(authority, "Bima");
    events.length = 0;
    expect(authority.kick("ghost")).toEqual({ ok: false, error: "not_found" });
    const res = authority.kick(a.playerId);
    expect(res.ok).toBe(true);
    expect(events[0]).toEqual({ type: "player.kicked", playerId: a.playerId });
    expect(lastSnapshot(events)?.players.map((p) => p.nickname)).toEqual(["Bima"]);

    authority.start();
    authority.publishQuestion();
    expect(authority.submit(a, "q1", correctFor(authority))).toEqual({ status: "invalid", reason: "unknown_player" });
  });

  it("leaderboard visibility and join lock are broadcast", () => {
    const { authority, events } = setup();
    expect(authority.setLeaderboardVisible(false)).toMatchObject({ ok: true, snapshot: { showLeaderboard: false } });
    expect(authority.setJoinsLocked(true)).toMatchObject({ ok: true, snapshot: { joinsLocked: true } });
    expect(types(events)).toEqual(["snapshot", "snapshot"]);
  });

  it("summary requires valid credentials", () => {
    const { authority } = setup([question("single", { id: "q1" })]);
    const a = join(authority, "Rara");
    authority.start();
    authority.publishQuestion();
    vi.advanceTimersByTime(1_000);
    authority.submit(a, "q1", correctFor(authority));
    authority.closeQuestion();
    authority.next();
    expect(authority.summary({ ...a, token: "forged" })).toBeNull();
    expect(authority.summary(a)).toMatchObject({ nickname: "Rara", correct: 1, rank: 1, score: 1000 });
  });

  it("persists every change through onChange", () => {
    const { authority, onChange } = setup();
    join(authority, "Rara");
    authority.start();
    const persisted = onChange.mock.calls.at(-1)![0] as PersistedAuthority;
    expect(persisted.engine.phase).toBe("intro");
    expect(GameEngine.restore(persisted.engine).state.phase).toBe("intro");
  });
});
