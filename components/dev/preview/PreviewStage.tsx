"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowRight, Eye, LayoutGrid, ListOrdered, RotateCcw, Trophy } from "lucide-react";
import { PlayerShell } from "@/components/player/PlayerShell";
import { PlayerLobbyView } from "@/components/player/views/PlayerLobbyView";
import { PlayerQuestionView } from "@/components/player/views/PlayerQuestionView";
import { PlayerWaitingView } from "@/components/player/views/PlayerWaitingView";
import { PlayerResultView } from "@/components/player/views/PlayerResultView";
import { PlayerFinalView } from "@/components/player/views/PlayerFinalView";
import { HostShell } from "@/components/host/HostShell";
import { HostControls, type HostAction } from "@/components/host/HostControls";
import { HostLobbyView } from "@/components/host/views/HostLobbyView";
import { HostIntroView } from "@/components/host/views/HostIntroView";
import { HostQuestionView } from "@/components/host/views/HostQuestionView";
import { HostLeaderboardView } from "@/components/host/views/HostLeaderboardView";
import { HostPodiumView } from "@/components/host/views/HostPodiumView";
import type { SessionSnapshot } from "@/lib/game/types";
import { publicEnv } from "@/lib/env.public";
import { useT } from "@/lib/i18n/client";
import type { PreviewFixture } from "./types";

const noop = () => undefined;
const noSubscribe = () => () => undefined;

/**
 * Renders one fixture exactly as the live controllers would (same shell, tone,
 * pattern and view), with inert handlers. A keyboard-only toolbar (Tab to reveal,
 * or press R) replays the entrance animation without polluting screenshots.
 */
export function PreviewStage({ fixture }: { fixture: PreviewFixture }) {
  const t = useT();
  const [run, setRun] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]")) return;
      if ((e.key === "r" || e.key === "R") && !e.metaKey && !e.ctrlKey) setRun((n) => n + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <nav aria-label={t("design.preview.title")} className="sr-only-focusable fixed top-3 left-3 z-[60] flex gap-2">
        <Link href="/preview" className="nf nf-sm nq-btn" data-variant="kapas" data-size="sm">
          <span className="nq-btn__label">
            <LayoutGrid size={16} aria-hidden="true" />
            {t("design.preview.all")}
          </span>
        </Link>
        <button
          type="button"
          className="nf nf-sm nq-btn"
          data-variant="sun"
          data-size="sm"
          onClick={() => setRun((n) => n + 1)}
          title={t("design.preview.replayHint")}
        >
          <span className="nq-btn__label">
            <RotateCcw size={16} aria-hidden="true" />
            {t("design.replay")}
          </span>
        </button>
      </nav>
      <Screen key={run} fixture={fixture} />
    </>
  );
}

function Screen({ fixture }: { fixture: PreviewFixture }) {
  return fixture.screen.startsWith("player-") ? <PlayerScreen fixture={fixture} /> : <HostScreen fixture={fixture} />;
}

/**
 * authorityNow - localNow: the countdown resumes where the fixture froze, and is
 * re-anchored a moment after it runs out, so a left-open preview never idles at 00.
 */
function useFixtureClock(fixture: PreviewFixture) {
  const anchor = "authorityNow" in fixture ? fixture.authorityNow : undefined;
  const deadline = "authorityNow" in fixture ? fixture.snapshot.deadlineAt : null;
  const [offset, setOffset] = useState(() => (anchor === undefined ? 0 : anchor - Date.now()));
  useEffect(() => {
    if (anchor === undefined || deadline === null) return;
    const id = window.setInterval(() => setOffset(anchor - Date.now()), Math.max(0, deadline - anchor) + 2500);
    return () => window.clearInterval(id);
  }, [anchor, deadline]);
  return offset;
}

function PlayerScreen({ fixture }: { fixture: PreviewFixture }) {
  const clockOffsetMs = useFixtureClock(fixture);

  switch (fixture.screen) {
    case "player-lobby":
      return (
        <PlayerShell pattern="grid" drift>
          <div className="flex flex-1 flex-col">
            <PlayerLobbyView
              snapshot={fixture.snapshot}
              nickname={fixture.nickname}
              avatarSeed={fixture.avatarSeed}
              onLeave={noop}
            />
          </div>
        </PlayerShell>
      );
    case "player-question":
      return (
        <PlayerShell tone="focus">
          <div className="flex flex-1 flex-col">
            <PlayerQuestionView
              question={fixture.question}
              deadlineAt={fixture.snapshot.deadlineAt}
              clockOffsetMs={clockOffsetMs}
              paused={false}
              pausedRemainingMs={null}
              submitted={null}
              onSubmit={noop}
            />
          </div>
        </PlayerShell>
      );
    case "player-waiting":
      return (
        <PlayerShell pattern="grid" drift>
          <div className="flex flex-1 flex-col">
            <PlayerWaitingView
              question={fixture.question}
              answer={fixture.answer}
              answeredCount={fixture.snapshot.answeredCount}
              totalPlayers={fixture.snapshot.players.length}
            />
          </div>
        </PlayerShell>
      );
    case "player-result-correct":
    case "player-result-miss":
      return (
        <PlayerShell pattern="flow" tone={fixture.result.isCorrect ? "celebrate" : "miss"}>
          <div className="flex flex-1 flex-col">
            <PlayerResultView
              question={fixture.question}
              reveal={fixture.reveal}
              result={fixture.result}
              totalPlayers={fixture.snapshot.players.length}
            />
          </div>
        </PlayerShell>
      );
    case "player-final":
      return (
        <PlayerShell pattern="kawung">
          <div className="flex flex-1 flex-col">
            <PlayerFinalView summary={fixture.summary} quizTitle={fixture.quizTitle} />
          </div>
        </PlayerShell>
      );
    default:
      return null;
  }
}

function HostScreen({ fixture }: { fixture: PreviewFixture }) {
  const t = useT();
  const clockOffsetMs = useFixtureClock(fixture);
  const origin = useSyncExternalStore(
    noSubscribe,
    () => publicEnv.appUrl || window.location.origin,
    () => publicEnv.appUrl,
  );

  // Mirrors HostStage's primary action for the phase, so the control bar is in frame.
  const primaryFor = (snapshot: SessionSnapshot): HostAction | null => {
    const isLast = snapshot.questionIndex >= snapshot.totalQuestions - 1;
    const next: HostAction = isLast
      ? { label: t("host.podium"), run: noop, icon: <Trophy size={20} aria-hidden="true" /> }
      : { label: t("host.next"), run: noop, icon: <ArrowRight size={20} aria-hidden="true" /> };
    switch (snapshot.phase) {
      case "intro":
        return { label: t("host.next"), run: noop, icon: <ArrowRight size={20} aria-hidden="true" /> };
      case "question":
        return { label: t("host.showResults"), run: noop, icon: <Eye size={20} aria-hidden="true" /> };
      case "reveal":
        return snapshot.showLeaderboard
          ? { label: t("host.showLeaderboard"), run: noop, icon: <ListOrdered size={20} aria-hidden="true" /> }
          : next;
      case "leaderboard":
        return next;
      default:
        return null;
    }
  };

  const controls = (snapshot: SessionSnapshot) => (
    <HostControls
      className="absolute right-[var(--host-safe)] bottom-[var(--host-safe)]"
      primary={primaryFor(snapshot)}
      paused={snapshot.paused}
      canPause={snapshot.phase === "question"}
      canSkip={snapshot.phase === "intro" || snapshot.phase === "question"}
      showLeaderboard={snapshot.showLeaderboard}
      fullscreen={false}
      muted={false}
      onPauseToggle={noop}
      onSkip={noop}
      onEnd={noop}
      onFullscreen={noop}
      onMute={noop}
      onToggleLeaderboard={noop}
    />
  );

  switch (fixture.screen) {
    case "host-lobby": {
      const { snapshot } = fixture;
      return (
        <HostShell pattern="grid" drift intensity="soft">
          <div className="flex min-h-0 flex-1 flex-col">
            <HostLobbyView
              snapshot={snapshot}
              joinUrl={origin ? `${origin}/join?room=${snapshot.roomCode}` : ""}
              displayUrl={`${(origin || "nusaquest").replace(/^https?:\/\//, "")}/join`}
              recentJoins={fixture.recentJoins}
              onStart={noop}
              onToggleLock={noop}
              onKick={noop}
            />
          </div>
        </HostShell>
      );
    }
    case "host-intro":
      return (
        <HostShell intensity="quiet">
          <div className="flex min-h-0 flex-1 flex-col">
            <HostIntroView upcoming={fixture.upcoming} courseName={fixture.snapshot.courseName} />
          </div>
          {controls(fixture.snapshot)}
        </HostShell>
      );
    case "host-question":
      return (
        <HostShell tone="focus" intensity="quiet">
          <div className="flex min-h-0 flex-1 flex-col">
            <HostQuestionView
              snapshot={fixture.snapshot}
              question={fixture.question}
              reveal={null}
              clockOffsetMs={clockOffsetMs}
            />
          </div>
          {controls(fixture.snapshot)}
        </HostShell>
      );
    case "host-reveal":
      return (
        <HostShell pattern="flow" intensity="quiet">
          <div className="flex min-h-0 flex-1 flex-col">
            <HostQuestionView
              snapshot={fixture.snapshot}
              question={fixture.question}
              reveal={fixture.reveal}
              clockOffsetMs={0}
            />
          </div>
          {controls(fixture.snapshot)}
        </HostShell>
      );
    case "host-leaderboard":
      return (
        <HostShell pattern="flow" intensity="quiet">
          <div className="flex min-h-0 flex-1 flex-col">
            <HostLeaderboardView snapshot={fixture.snapshot} />
          </div>
          {controls(fixture.snapshot)}
        </HostShell>
      );
    case "host-podium":
      return (
        <HostShell pattern="kawung" tone="celebrate" intensity="quiet">
          <div className="flex min-h-0 flex-1 flex-col">
            <HostPodiumView snapshot={fixture.snapshot} analyticsHref="/sessions" />
          </div>
        </HostShell>
      );
    default:
      return null;
  }
}
