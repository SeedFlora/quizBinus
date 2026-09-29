/**
 * useGameSession folds provider events into React state. A fake provider lets each
 * test push exactly the events a transport would deliver.
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useGameSession } from "@/lib/realtime/use-game-session";
import type { ConnectionStatus, GameEvent, PlayerCredentials, RealtimeGameProvider, Role } from "@/lib/realtime/types";
import { demoSnapshot } from "@/lib/demo/simulate";
import { DEMO_SELF } from "@/lib/seed/players";
import type { SessionSnapshot } from "@/lib/game/types";

function fakeProvider() {
  let emit: (e: GameEvent) => void = () => undefined;
  let status: (s: ConnectionStatus) => void = () => undefined;
  const unsubscribe = vi.fn();
  const subscribe = vi.fn(
    (_sessionId: string, _role: Role, onEvent: (e: GameEvent) => void, onStatus?: (s: ConnectionStatus) => void) => {
      emit = onEvent;
      status = onStatus ?? (() => undefined);
      return unsubscribe;
    },
  );
  const provider = { kind: "local", subscribe } as unknown as RealtimeGameProvider;
  return {
    provider,
    subscribe,
    unsubscribe,
    emit: (e: GameEvent) => act(() => emit(e)),
    status: (s: ConnectionStatus) => act(() => status(s)),
  };
}

const credentials: PlayerCredentials = {
  sessionId: "demo",
  playerId: DEMO_SELF.id,
  token: "t",
  roomCode: "482913",
  nickname: DEMO_SELF.nickname,
  avatarSeed: DEMO_SELF.avatarSeed,
};
const playerRole: Role = { kind: "player", credentials };

const lobby = () => demoSnapshot({ playedQuestions: 0, stopAt: "lobby", as: "self" });
const snap = (s: SessionSnapshot): GameEvent => ({ type: "snapshot", snapshot: s });

describe("useGameSession", () => {
  it("does nothing without a session id or role", () => {
    const fake = fakeProvider();
    const { result } = renderHook(() => useGameSession(fake.provider, null, playerRole));
    expect(fake.subscribe).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ snapshot: null, status: "connecting", kicked: false, ended: null });
  });

  it("subscribes once per session/role identity and unsubscribes on unmount", () => {
    const fake = fakeProvider();
    const { rerender, unmount } = renderHook(({ role }) => useGameSession(fake.provider, "demo", role), {
      initialProps: { role: playerRole },
    });
    // A new role object with the same identity must not resubscribe.
    rerender({ role: { kind: "player", credentials: { ...credentials } } });
    expect(fake.subscribe).toHaveBeenCalledTimes(1);
    unmount();
    expect(fake.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("tracks connection status (reconnecting → online)", () => {
    const fake = fakeProvider();
    const { result } = renderHook(() => useGameSession(fake.provider, "demo", playerRole));
    fake.status("online");
    fake.status("reconnecting");
    expect(result.current.status).toBe("reconnecting");
    fake.status("online");
    expect(result.current.status).toBe("online");
  });

  it("stores snapshots and derives the clock offset from serverNow", () => {
    vi.useFakeTimers({ now: 1_000_000 });
    try {
      const fake = fakeProvider();
      const { result } = renderHook(() => useGameSession(fake.provider, "demo", playerRole));
      const s = { ...lobby(), serverNow: 1_000_250 };
      fake.emit(snap(s));
      expect(result.current.snapshot?.sessionId).toBe("demo");
      expect(result.current.clockOffsetMs).toBe(250);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the private self block when a public broadcast omits it, reconciling score/rank from the leaderboard", () => {
    const fake = fakeProvider();
    const { result } = renderHook(() => useGameSession(fake.provider, "demo", playerRole));
    const question = demoSnapshot({ playedQuestions: 1, stopAt: "question", as: "self" });
    fake.emit(snap({ ...question, self: { ...question.self!, currentAnswer: { kind: "choice", answerIds: ["x"] } } }));
    expect(result.current.snapshot?.self?.currentAnswer).toEqual({ kind: "choice", answerIds: ["x"] });

    const publicReveal = demoSnapshot({ playedQuestions: 2, stopAt: "reveal" }); // host view: no self
    expect(publicReveal.self).toBeUndefined();
    fake.emit(snap(publicReveal));
    const entry = publicReveal.leaderboard.find((e) => e.playerId === DEMO_SELF.id)!;
    expect(result.current.snapshot?.self).toMatchObject({
      playerId: DEMO_SELF.id,
      score: entry.score,
      rank: entry.rank,
      streak: entry.streak,
      currentAnswer: null,
    });
  });

  it("a resync snapshot after reconnecting replaces stale state", () => {
    const fake = fakeProvider();
    const { result } = renderHook(() => useGameSession(fake.provider, "demo", playerRole));
    fake.emit(snap(lobby()));
    fake.status("online");
    fake.status("reconnecting");
    const current = demoSnapshot({ playedQuestions: 3, stopAt: "leaderboard", as: "self" });
    fake.status("online");
    fake.emit(snap(current));
    expect(result.current.snapshot).toMatchObject({ phase: "leaderboard", questionIndex: 2 });
    expect(result.current.status).toBe("online");
  });

  it("patches the answered count from progress events for the current question only", () => {
    const fake = fakeProvider();
    const { result } = renderHook(() => useGameSession(fake.provider, "demo", playerRole));
    const s = demoSnapshot({ playedQuestions: 1, stopAt: "question", answeredInOpenQuestion: 3, as: "self" });
    fake.emit(snap(s));
    fake.emit({ type: "progress", questionId: s.question!.id, answered: 17, total: 42 });
    expect(result.current.snapshot?.answeredCount).toBe(17);
    fake.emit({ type: "progress", questionId: "some-other-question", answered: 40, total: 42 });
    expect(result.current.snapshot?.answeredCount).toBe(17);
  });

  it("adds joiners once and records recent joins", () => {
    const fake = fakeProvider();
    const { result } = renderHook(() => useGameSession(fake.provider, "demo", playerRole));
    const s = lobby();
    fake.emit(snap(s));
    const player = { id: "new-1", nickname: "Nadia R", avatarSeed: "n" };
    fake.emit({ type: "player.joined", player, playerCount: s.players.length + 1 });
    fake.emit({ type: "player.joined", player, playerCount: s.players.length + 1 });
    expect(result.current.snapshot?.players.filter((p) => p.id === "new-1")).toHaveLength(1);
    expect(result.current.recentJoins).toEqual(["new-1"]);
  });

  it("player.kicked for this player sets kicked; for others it only removes them", () => {
    const fake = fakeProvider();
    const { result } = renderHook(() => useGameSession(fake.provider, "demo", playerRole));
    const s = lobby();
    fake.emit(snap(s));
    const other = s.players.find((p) => p.id !== DEMO_SELF.id)!;
    fake.emit({ type: "player.kicked", playerId: other.id });
    expect(result.current.kicked).toBe(false);
    expect(result.current.snapshot?.players.some((p) => p.id === other.id)).toBe(false);

    fake.emit({ type: "player.kicked", playerId: DEMO_SELF.id });
    expect(result.current.kicked).toBe(true);
  });

  it("player.kicked before any snapshot still flags this player", () => {
    const fake = fakeProvider();
    const { result } = renderHook(() => useGameSession(fake.provider, "demo", playerRole));
    fake.emit({ type: "player.kicked", playerId: DEMO_SELF.id });
    expect(result.current.kicked).toBe(true);
  });

  it("player.left removes players in the lobby but keeps them listed mid-game", () => {
    const fake = fakeProvider();
    const { result } = renderHook(() => useGameSession(fake.provider, "demo", playerRole));
    const inLobby = lobby();
    const leaver = inLobby.players[0]!;
    fake.emit(snap(inLobby));
    fake.emit({ type: "player.left", playerId: leaver.id, playerCount: 0 });
    expect(result.current.snapshot?.players.some((p) => p.id === leaver.id)).toBe(false);

    const live = demoSnapshot({ playedQuestions: 1, stopAt: "question", as: "self" });
    fake.emit(snap(live));
    fake.emit({ type: "player.left", playerId: leaver.id, playerCount: 0 });
    expect(result.current.snapshot?.players.some((p) => p.id === leaver.id)).toBe(true);
  });

  it("records the end of the session from the event or from an ended snapshot", () => {
    const fake = fakeProvider();
    const { result } = renderHook(() => useGameSession(fake.provider, "demo", playerRole));
    fake.emit({ type: "session.ended", reason: "finished" });
    expect(result.current.ended).toEqual({ type: "session.ended", reason: "finished" });

    const other = fakeProvider();
    const second = renderHook(() => useGameSession(other.provider, "demo", playerRole));
    const s = lobby();
    other.emit(snap({ ...s, phase: "ended", endedReason: "host_ended" }));
    expect(second.result.current.ended).toEqual({ type: "session.ended", reason: "host_ended" });
  });
});
