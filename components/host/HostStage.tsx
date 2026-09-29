"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Eye, ListOrdered, Trophy } from "lucide-react";
import { HostShell } from "./HostShell";
import { HostControls, type HostAction } from "./HostControls";
import { HostLobbyView } from "./views/HostLobbyView";
import { HostIntroView } from "./views/HostIntroView";
import { HostQuestionView } from "./views/HostQuestionView";
import { HostLeaderboardView } from "./views/HostLeaderboardView";
import { HostPodiumView } from "./views/HostPodiumView";
import { HostMusic } from "./HostMusic";
import { ConnectionBanner } from "@/components/game/ConnectionBanner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { NusaSpinner } from "@/components/ui/NusaSpinner";
import { ensureHostDemo, providerFor } from "@/lib/realtime";
import { useGameSession } from "@/lib/realtime/use-game-session";
import type { HostCommandResult, Role } from "@/lib/realtime/types";
import { publicEnv } from "@/lib/env.public";
import { useSound } from "@/lib/audio/use-sound";
import { getAudio } from "@/lib/audio/engine";
import { useT } from "@/lib/i18n/client";

const HOST_ROLE: Role = { kind: "host" };
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\]|.+\.localhost)$/i;
const INTRO_MS = 3200;
/** Past the engine's answer grace (DEFAULT_GRACE_MS = 750). */
const CLOSE_AFTER_DEADLINE_MS = 1000;

type HostView = "loading" | "lobby" | "intro" | "question" | "reveal" | "leaderboard" | "podium" | "missing";

export function HostStage({ sessionId }: { sessionId: string }) {
  const t = useT();
  const reduce = useReducedMotion();
  const provider = useMemo(() => providerFor(sessionId), [sessionId]);
  const [ready, setReady] = useState(sessionId !== "demo");
  const game = useGameSession(provider, ready ? sessionId : null, HOST_ROLE);
  const snapshot = game.snapshot;
  const { muted, toggleMute } = useSound();
  const [busy, setBusy] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [missing, setMissing] = useState(false);

  // /host/session/demo: start (or reuse) the shared server demo so phones on the
  // network can join; offline or without the right to host it, the demo runs in this tab.
  useEffect(() => {
    if (sessionId !== "demo") return;
    void ensureHostDemo().then(() => setReady(true));
  }, [sessionId]);

  // Projector opened on localhost: phones cannot reach that, so show the laptop's LAN address.
  const [lanOrigin, setLanOrigin] = useState<string | null>(null);
  useEffect(() => {
    if (publicEnv.appUrl || publicEnv.realtimeMode !== "server" || !LOOPBACK.test(window.location.hostname)) return;
    let cancelled = false;
    void fetch("/api/network", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<unknown>) : null))
      .then((body) => {
        const origins = (body as { origins?: unknown } | null)?.origins;
        const first = Array.isArray(origins)
          ? origins.find((o): o is string => typeof o === "string" && /^https?:\/\/[^\s/]+$/.test(o))
          : undefined;
        if (!cancelled && first) setLanOrigin(first);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // A session nobody serves (wrong id, or stored in another browser).
  useEffect(() => {
    if (!ready || snapshot) return;
    const id = window.setTimeout(() => setMissing(true), 4000);
    return () => window.clearTimeout(id);
  }, [ready, snapshot]);

  const run = useCallback(async (fn: () => Promise<HostCommandResult>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }, []);

  const phase = snapshot?.phase;
  const view: HostView = !snapshot
    ? missing
      ? "missing"
      : "loading"
    : phase === "lobby"
      ? "lobby"
      : phase === "intro"
        ? "intro"
        : phase === "question"
          ? "question"
          : phase === "reveal"
            ? "reveal"
            : phase === "leaderboard"
              ? "leaderboard"
              : "podium";

  // Intro auto-advances into the question. Only the tab that sees the intro fires it;
  // a duplicate call is rejected by the engine (invalid_phase), so this is safe.
  const introKey = phase === "intro" ? snapshot?.questionIndex : null;
  useEffect(() => {
    if (introKey === null || introKey === undefined) return;
    const id = window.setTimeout(() => void provider.publishQuestion(sessionId), reduce ? 1200 : INTRO_MS);
    return () => window.clearTimeout(id);
  }, [introKey, provider, sessionId, reduce]);

  // Time's up: ask the authority to close ~1 s after the deadline (past the answer grace).
  // The server and the in-tab (local) authority usually close on their own timers
  // already; this is the fallback, and a repeat close is a harmless invalid_phase. Once per
  // deadline (a pause/resume sets a new one).
  const clockOffset = useRef(0);
  useEffect(() => {
    clockOffset.current = game.clockOffsetMs;
  }, [game.clockOffsetMs]);
  const closedFor = useRef<string | null>(null);
  const deadlineAt = phase === "question" && !snapshot?.paused ? (snapshot?.deadlineAt ?? null) : null;
  const deadlineKey = deadlineAt === null ? null : `${snapshot?.questionIndex}:${deadlineAt}`;
  useEffect(() => {
    if (deadlineAt === null || deadlineKey === null || closedFor.current === deadlineKey) return;
    const delay = Math.max(0, deadlineAt + CLOSE_AFTER_DEADLINE_MS - (Date.now() + clockOffset.current));
    const id = window.setTimeout(() => {
      closedFor.current = deadlineKey;
      void provider.closeQuestion(sessionId);
    }, delay);
    return () => window.clearTimeout(id);
  }, [deadlineAt, deadlineKey, provider, sessionId]);

  // Round-end sting when a question is revealed.
  const revealKey = phase === "reveal" ? snapshot?.questionIndex : null;
  useEffect(() => {
    if (revealKey !== null && revealKey !== undefined) void getAudio().play("round-end");
  }, [revealKey]);

  // Soft join sound, rate-limited so a class of 40 doesn't become noise.
  const lastJoinSound = useRef(0);
  const joins = game.recentJoins.length;
  useEffect(() => {
    if (!joins || Date.now() - lastJoinSound.current < 900) return;
    lastJoinSound.current = Date.now();
    void getAudio().play("join");
  }, [joins]);

  // URL mirrors the stage so a refresh lands on the right screen.
  useEffect(() => {
    const path =
      view === "lobby"
        ? `/host/session/${sessionId}/lobby`
        : view === "podium"
          ? `/host/session/${sessionId}/podium`
          : view === "loading" || view === "missing"
            ? null
            : `/host/session/${sessionId}`;
    if (path && window.location.pathname !== path) window.history.replaceState(null, "", path);
  }, [view, sessionId]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);

  const isLast = snapshot ? snapshot.questionIndex >= snapshot.totalQuestions - 1 : false;
  const primary: HostAction | null = (() => {
    if (!snapshot) return null;
    switch (snapshot.phase) {
      case "lobby":
        return null; // the lobby has its own oversized start button
      case "intro":
        return {
          label: t("host.next"),
          run: () => void run(() => provider.publishQuestion(sessionId)),
          icon: <ArrowRight size={20} aria-hidden="true" />,
        };
      case "question":
        return {
          label: t("host.showResults"),
          run: () => void run(() => provider.closeQuestion(sessionId)),
          icon: <Eye size={20} aria-hidden="true" />,
        };
      case "reveal":
        return snapshot.showLeaderboard
          ? {
              label: t("host.showLeaderboard"),
              run: () => void run(() => provider.publishLeaderboard(sessionId)),
              icon: <ListOrdered size={20} aria-hidden="true" />,
            }
          : {
              label: isLast ? t("host.podium") : t("host.next"),
              run: () => void run(() => provider.nextQuestion(sessionId)),
              icon: isLast ? <Trophy size={20} aria-hidden="true" /> : <ArrowRight size={20} aria-hidden="true" />,
            };
      case "leaderboard":
        return {
          label: isLast ? t("host.podium") : t("host.next"),
          run: () => void run(() => provider.nextQuestion(sessionId)),
          icon: isLast ? <Trophy size={20} aria-hidden="true" /> : <ArrowRight size={20} aria-hidden="true" />,
        };
      default:
        return null;
    }
  })();

  // Keyboard + presentation clicker support.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable], dialog[open]"))
        return;
      const key = e.key;
      if (key === " " || key === "Enter" || key === "ArrowRight" || key === "PageDown") {
        if (e.target instanceof HTMLButtonElement && (key === " " || key === "Enter")) return; // let focused buttons act
        if (snapshot?.phase === "lobby" && snapshot.players.length > 0) {
          e.preventDefault();
          void run(() => provider.startGame(sessionId));
        } else if (primary) {
          e.preventDefault();
          primary.run();
        }
      } else if (key === "p" || key === "P") {
        if (snapshot?.phase === "question")
          void run(() => (snapshot.paused ? provider.resumeGame(sessionId) : provider.pauseGame(sessionId)));
      } else if (key === "f" || key === "F") toggleFullscreen();
      else if (key === "m" || key === "M") toggleMute();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [primary, snapshot, provider, sessionId, run, toggleFullscreen, toggleMute]);

  const origin = publicEnv.appUrl || lanOrigin || (typeof window !== "undefined" ? window.location.origin : "");
  const joinUrl = snapshot ? `${origin}/join?room=${snapshot.roomCode}` : "";
  const displayUrl = `${origin.replace(/^https?:\/\//, "")}/join`;

  const pattern =
    view === "lobby"
      ? "grid"
      : view === "podium"
        ? "kawung"
        : view === "reveal" || view === "leaderboard"
          ? "flow"
          : undefined;
  const tone = view === "podium" ? "celebrate" : view === "question" ? "focus" : "default";

  return (
    <HostShell pattern={pattern} tone={tone} drift={view === "lobby"} intensity={view === "lobby" ? "soft" : "quiet"}>
      <ConnectionBanner status={game.status} />
      {/* Adaptive gamelan × arcade music: projector only, never on phones. */}
      <HostMusic snapshot={snapshot} clockOffsetMs={game.clockOffsetMs} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={
            view === "question" || view === "reveal"
              ? `q:${snapshot?.questionIndex}`
              : `${view}:${snapshot?.questionIndex}`
          }
          className="flex min-h-0 flex-1 flex-col"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {view === "loading" && (
            <div className="flex flex-1 flex-col items-center justify-center gap-5 text-stage-muted" role="status">
              <NusaSpinner size={56} className="text-sun" />
              <p className="text-2xl font-bold">{t("common.loading")}</p>
            </div>
          )}
          {view === "missing" && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center" role="alert">
              <p className="font-display-tight text-5xl text-kapas">{t("errors.invalidCode")}</p>
              <p className="text-xl text-stage-muted">{t("errors.expired")}</p>
            </div>
          )}
          {view === "lobby" && snapshot && (
            <HostLobbyView
              snapshot={snapshot}
              joinUrl={joinUrl}
              displayUrl={displayUrl}
              recentJoins={game.recentJoins}
              starting={busy}
              onStart={() => void run(() => provider.startGame(sessionId))}
              onToggleLock={() => void run(() => provider.setJoinsLocked(sessionId, !snapshot.joinsLocked))}
              onKick={(p) => void run(() => provider.kickPlayer(sessionId, p.id))}
            />
          )}
          {view === "intro" && snapshot?.upcoming && (
            <HostIntroView upcoming={snapshot.upcoming} courseName={snapshot.courseName} />
          )}
          {(view === "question" || view === "reveal") && snapshot?.question && (
            <HostQuestionView
              snapshot={snapshot}
              question={snapshot.question}
              reveal={view === "reveal" ? snapshot.reveal : null}
              clockOffsetMs={game.clockOffsetMs}
            />
          )}
          {view === "leaderboard" && snapshot && <HostLeaderboardView snapshot={snapshot} />}
          {view === "podium" && snapshot && (
            <HostPodiumView snapshot={snapshot} analyticsHref={`/sessions?focus=${sessionId}`} />
          )}
        </motion.div>
      </AnimatePresence>

      {snapshot && view !== "lobby" && view !== "podium" && (
        <HostControls
          className="absolute right-[var(--host-safe)] bottom-[var(--host-safe)]"
          primary={primary}
          busy={busy}
          paused={snapshot.paused}
          canPause={snapshot.phase === "question"}
          canSkip={snapshot.phase === "intro" || snapshot.phase === "question"}
          showLeaderboard={snapshot.showLeaderboard}
          fullscreen={fullscreen}
          muted={muted}
          onPauseToggle={() =>
            void run(() => (snapshot.paused ? provider.resumeGame(sessionId) : provider.pauseGame(sessionId)))
          }
          onSkip={() => void run(() => provider.skipQuestion(sessionId))}
          onEnd={() => setConfirmEnd(true)}
          onFullscreen={toggleFullscreen}
          onMute={toggleMute}
          onToggleLeaderboard={() =>
            void run(() => provider.setLeaderboardVisible(sessionId, !snapshot.showLeaderboard))
          }
        />
      )}

      <ConfirmDialog
        open={confirmEnd}
        title={t("host.endConfirmTitle")}
        body={t("host.endConfirmBody")}
        confirmLabel={t("host.endConfirmCta")}
        tone="danger"
        onCancel={() => setConfirmEnd(false)}
        onConfirm={() => {
          setConfirmEnd(false);
          void run(() => provider.endSession(sessionId));
        }}
      />
    </HostShell>
  );
}
