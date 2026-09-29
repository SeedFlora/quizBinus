"use client";

import { useEffect, useRef, useState } from "react";
import type { SessionSnapshot } from "@/lib/game/types";
import type { ConnectionStatus, GameEvent, PlayerCredentials, RealtimeGameProvider, Role } from "./types";

export interface GameSessionState {
  snapshot: SessionSnapshot | null;
  status: ConnectionStatus;
  /** authorityNow − localNow, in ms. Add to Date.now() for authority time. */
  clockOffsetMs: number;
  /** Players who joined since mount (for lobby bubble animations). */
  recentJoins: string[];
  kicked: boolean;
  ended: (GameEvent & { type: "session.ended" }) | null;
}

/**
 * Subscribes to a live session and folds events into React state.
 * `snapshot` is always the authority's latest view; `progress` events patch the
 * answered count between snapshots so the host counter moves in real time.
 */
export function useGameSession(provider: RealtimeGameProvider, sessionId: string | null, role: Role | null) {
  const [state, setState] = useState<GameSessionState>({
    snapshot: null,
    status: "connecting",
    clockOffsetMs: 0,
    recentJoins: [],
    kicked: false,
    ended: null,
  });
  const roleKey = role ? (role.kind === "host" ? "host" : `p:${role.credentials.playerId}`) : "none";
  const roleRef = useRef(role);
  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  useEffect(() => {
    if (!sessionId || !roleRef.current) return;
    const selfId = roleRef.current.kind === "player" ? roleRef.current.credentials.playerId : null;

    const onEvent = (event: GameEvent) => {
      setState((prev) => {
        switch (event.type) {
          case "snapshot": {
            const snap = event.snapshot;
            // Keep the private `self` block when a public broadcast omits it.
            const self = snap.self ?? (prev.snapshot?.self && reconcileSelf(prev.snapshot.self, snap));
            return {
              ...prev,
              snapshot: { ...snap, self: self ?? undefined },
              clockOffsetMs: snap.serverNow - Date.now(),
              ended:
                snap.phase === "ended" && snap.endedReason === "host_ended"
                  ? { type: "session.ended", reason: "host_ended" }
                  : prev.ended,
            };
          }
          case "progress":
            if (!prev.snapshot || prev.snapshot.question?.id !== event.questionId) return prev;
            return { ...prev, snapshot: { ...prev.snapshot, answeredCount: event.answered } };
          case "player.joined": {
            if (!prev.snapshot) return prev;
            if (prev.snapshot.players.some((p) => p.id === event.player.id)) return prev;
            return {
              ...prev,
              recentJoins: [...prev.recentJoins.slice(-40), event.player.id],
              snapshot: { ...prev.snapshot, players: [...prev.snapshot.players, event.player] },
            };
          }
          case "player.left":
          case "player.kicked": {
            const kicked = event.type === "player.kicked" && event.playerId === selfId;
            if (!prev.snapshot) return { ...prev, kicked: prev.kicked || kicked };
            return {
              ...prev,
              kicked: prev.kicked || kicked,
              snapshot: {
                ...prev.snapshot,
                players:
                  event.type === "player.kicked" || prev.snapshot.phase === "lobby"
                    ? prev.snapshot.players.filter((p) => p.id !== event.playerId)
                    : prev.snapshot.players,
              },
            };
          }
          case "session.ended":
            return { ...prev, ended: event };
        }
      });
    };

    const unsubscribe = provider.subscribe(sessionId, roleRef.current, onEvent, (status) =>
      setState((prev) => ({ ...prev, status })),
    );
    return unsubscribe;
    // roleKey captures identity changes; the role object itself may be recreated each render.
  }, [provider, sessionId, roleKey]);

  return state;
}

/**
 * Update the player's private block from a public snapshot (score/rank from the
 * leaderboard). `currentAnswer` is only authoritative in a player-specific snapshot
 * (resume), so it is cleared here; controllers track their own submissions.
 */
function reconcileSelf(self: NonNullable<SessionSnapshot["self"]>, snap: SessionSnapshot): SessionSnapshot["self"] {
  const entry = snap.leaderboard.find((e) => e.playerId === self.playerId);
  return {
    ...self,
    score: entry?.score ?? self.score,
    streak: entry?.streak ?? self.streak,
    rank: entry?.rank ?? self.rank,
    currentAnswer: null,
  };
}

export function playerRole(credentials: PlayerCredentials | null): Role | null {
  return credentials ? { kind: "player", credentials } : null;
}
