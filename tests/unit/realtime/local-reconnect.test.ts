// @vitest-environment jsdom
/**
 * Two "browser tabs" over the real LocalRuntime + LocalRealtimeProvider.
 *
 * Each tab is a fresh module graph (vi.resetModules), so each gets its own runtime
 * singleton, exactly like two tabs of one browser: they share localStorage (jsdom's
 * window) and talk over Node's BroadcastChannel. Real timers are used because the
 * wire is asynchronous; waits are bounded by the heartbeat (2 s) and watchdog.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalRealtimeProvider } from "@/lib/realtime/local/provider";
import type { LocalRuntime } from "@/lib/realtime/local/runtime";
import type { ConnectionStatus, GameEvent, PlayerCredentials, Role } from "@/lib/realtime/types";
import type { SessionSnapshot } from "@/lib/game/types";

interface Tab {
  provider: LocalRealtimeProvider;
  runtime: LocalRuntime;
}

const tabs: Tab[] = [];
const cleanups: (() => void)[] = [];

async function openTab(): Promise<Tab> {
  vi.resetModules();
  const { LocalRealtimeProvider } = await import("@/lib/realtime/local/provider");
  const { getLocalRuntime } = await import("@/lib/realtime/local/runtime");
  const tab = { provider: new LocalRealtimeProvider(), runtime: getLocalRuntime() };
  tabs.push(tab);
  return tab;
}

/** Simulates closing a tab: stop serving, stop the heartbeat, close the channel. */
function closeTab(tab: Tab) {
  const internals = tab.runtime as unknown as {
    hosted: Map<string, unknown>;
    channel: BroadcastChannel | null;
    heartbeat: ReturnType<typeof setInterval> | null;
  };
  for (const id of [...internals.hosted.keys()]) tab.runtime.release(id);
  if (internals.heartbeat) clearInterval(internals.heartbeat);
  internals.heartbeat = null;
  internals.channel?.close();
  internals.channel = null;
}

function watch(tab: Tab, sessionId: string, role: Role) {
  const events: GameEvent[] = [];
  const statuses: ConnectionStatus[] = [];
  const off = tab.provider.subscribe(
    sessionId,
    role,
    (e) => events.push(e),
    (s) => statuses.push(s),
  );
  cleanups.push(off);
  const snapshots = () =>
    events.filter((e): e is Extract<GameEvent, { type: "snapshot" }> => e.type === "snapshot").map((e) => e.snapshot);
  return { events, statuses, snapshots, latest: (): SessionSnapshot | undefined => snapshots().at(-1) };
}

async function hostWithPlayer() {
  const host = await openTab();
  const { sessionId, roomCode } = await host.provider.createSession({ quizId: "os-battle" });
  const player = await openTab();

  const lookup = await player.provider.resolveRoom(roomCode);
  expect(lookup).toMatchObject({ status: "ok", sessionId, courseCode: "COMP6716" });

  const joined = await player.provider.joinSession({ roomCode, nickname: "Rara", avatarSeed: "rara" });
  if (!joined.ok) throw new Error(`join failed: ${joined.error}`);
  return { host, player, sessionId, roomCode, credentials: joined.credentials };
}

afterEach(() => {
  cleanups.splice(0).forEach((off) => off());
  tabs.splice(0).forEach(closeTab);
  window.localStorage.clear();
});

describe("LocalRealtimeProvider across two tabs", () => {
  it("a player tab finds, joins and follows a session hosted in another tab", async () => {
    const { host, player, sessionId, credentials } = await hostWithPlayer();
    expect(player.runtime.owns(sessionId)).toBe(false);
    expect(host.runtime.owns(sessionId)).toBe(true);

    const view = watch(player, sessionId, { kind: "player", credentials });
    await vi.waitFor(() => expect(view.statuses).toContain("online"));
    expect(view.latest()?.self?.nickname).toBe("Rara");

    await host.provider.startGame(sessionId);
    await vi.waitFor(() => expect(view.latest()?.phase).toBe("intro"));
    await host.provider.publishQuestion(sessionId);
    await vi.waitFor(() => expect(view.latest()?.phase).toBe("question"));

    // The player's copy of the open question is sanitized.
    expect(JSON.stringify(view.latest())).not.toContain("isCorrect");

    const q = view.latest()!.question!;
    const payload = { kind: "choice" as const, answerIds: [q.answers[0]!.id] };
    await expect(player.provider.submitAnswer(credentials, q.id, payload)).resolves.toMatchObject({
      status: "accepted",
    });
    await expect(player.provider.submitAnswer(credentials, q.id, payload)).resolves.toEqual({ status: "duplicate" });
    await vi.waitFor(() =>
      expect(view.events).toContainEqual({ type: "progress", questionId: q.id, answered: 1, total: 1 }),
    );
  });

  it("rejects a forged token over the wire", async () => {
    const { player, sessionId, credentials } = await hostWithPlayer();
    const forged: PlayerCredentials = { ...credentials, token: "forged" };
    await expect(player.provider.resumePlayer(forged)).resolves.toEqual({ ok: false, error: "not_found" });
    await expect(player.provider.getSnapshot(sessionId, { kind: "player", credentials: forged })).resolves.toBeNull();
    await expect(player.provider.resumePlayer(credentials)).resolves.toMatchObject({ ok: true });
  });

  it("after a connection blip (offline → online) the next heartbeat triggers a full snapshot resync", async () => {
    const { player, sessionId, credentials } = await hostWithPlayer();
    const view = watch(player, sessionId, { kind: "player", credentials });
    await vi.waitFor(() => expect(view.statuses).toContain("online"));

    window.dispatchEvent(new Event("offline"));
    expect(view.statuses.at(-1)).toBe("offline");
    window.dispatchEvent(new Event("online"));
    expect(view.statuses.at(-1)).toBe("reconnecting");

    const before = view.snapshots().length;
    await vi.waitFor(() => expect(view.statuses.at(-1)).toBe("online"), { timeout: 5_000 });
    // The resync is a player-specific snapshot (carries `self`), not a public broadcast.
    await vi.waitFor(() =>
      expect(
        view
          .snapshots()
          .slice(before)
          .some((s) => s.self?.playerId === credentials.playerId),
      ).toBe(true),
    );
  });

  it("survives the host tab dying: reconnecting, then a new host tab restores the game and the player resyncs", async () => {
    const { host, player, sessionId, credentials } = await hostWithPlayer();
    await host.provider.startGame(sessionId);
    await host.provider.publishQuestion(sessionId);

    const view = watch(player, sessionId, { kind: "player", credentials });
    await vi.waitFor(() => expect(view.latest()?.phase).toBe("question"));
    const q = view.latest()!.question!;
    const payload = { kind: "choice" as const, answerIds: [q.answers[1]!.id] };
    expect((await player.provider.submitAnswer(credentials, q.id, payload)).status).toBe("accepted");

    // Host tab crashes. No heartbeat → the watchdog marks the player as reconnecting.
    closeTab(host);
    await vi.waitFor(() => expect(view.statuses).toContain("reconnecting"), { timeout: 9_000, interval: 250 });

    // The lecturer reopens the host screen: state is restored from localStorage.
    const reopened = await openTab();
    expect(await reopened.runtime.host(sessionId)).toBe(true);

    const before = view.snapshots().length;
    await vi.waitFor(() => expect(view.statuses.at(-1)).toBe("online"), { timeout: 5_000 });
    await vi.waitFor(() => expect(view.snapshots().length).toBeGreaterThan(before));
    const resynced = view
      .snapshots()
      .slice(before)
      .find((s) => s.self)!;
    expect(resynced).toMatchObject({ phase: "question", questionIndex: 0 });
    // The already-submitted answer survives, so the phone shows "Jawaban terkunci"…
    expect(resynced.self?.currentAnswer).toEqual(payload);
    // …and the new authority still refuses a second submission.
    await expect(player.provider.submitAnswer(credentials, q.id, payload)).resolves.toEqual({ status: "duplicate" });
  }, 25_000);

  it("a kick reaches the player tab as player.kicked, and resume is refused afterwards", async () => {
    const { host, player, sessionId, credentials } = await hostWithPlayer();
    const view = watch(player, sessionId, { kind: "player", credentials });
    await vi.waitFor(() => expect(view.statuses).toContain("online"));

    await host.provider.kickPlayer(sessionId, credentials.playerId);
    await vi.waitFor(() =>
      expect(view.events).toContainEqual({ type: "player.kicked", playerId: credentials.playerId }),
    );
    await expect(player.provider.resumePlayer(credentials)).resolves.toEqual({ ok: false, error: "kicked" });
  });

  it("unknown rooms resolve to not_found after the request times out", async () => {
    const tab = await openTab();
    await expect(tab.provider.resolveRoom("730418")).resolves.toEqual({ status: "not_found" });
    await expect(tab.provider.resolveRoom("12345")).resolves.toEqual({ status: "not_found" });
  });
});
