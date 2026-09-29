"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { PlayerShell } from "./PlayerShell";
import { PlayerLobbyView } from "./views/PlayerLobbyView";
import { PlayerIntroView } from "./views/PlayerIntroView";
import { PlayerQuestionView } from "./views/PlayerQuestionView";
import { PlayerWaitingView } from "./views/PlayerWaitingView";
import { PlayerResultView } from "./views/PlayerResultView";
import { PlayerFinalView } from "./views/PlayerFinalView";
import { PlayerNoticeView, type NoticeKind } from "./views/PlayerNoticeView";
import { ConnectionBanner } from "@/components/game/ConnectionBanner";
import { NusaSpinner } from "@/components/ui/NusaSpinner";
import { providerFor } from "@/lib/realtime";
import { clearCredentials, loadCredentials, loadCredentialsByRoom } from "@/lib/realtime/credentials";
import { useGameSession, playerRole } from "@/lib/realtime/use-game-session";
import type { PlayerCredentials } from "@/lib/realtime/types";
import type { AnswerPayload, PlayerSummary } from "@/lib/game/types";
import { useT } from "@/lib/i18n/client";
import { getAudio } from "@/lib/audio/engine";

type View = "loading" | "lobby" | "intro" | "question" | "waiting" | "result" | "final" | NoticeKind;

/** Which URL each view lives at, so refresh resumes in place and states are linkable. */
function pathFor(view: View, c: PlayerCredentials): string | null {
  switch (view) {
    case "lobby":
      return `/room/${c.roomCode}/lobby`;
    case "intro":
    case "question":
      return `/play/${c.sessionId}`;
    case "waiting":
      return `/play/${c.sessionId}/waiting`;
    case "result":
      return `/play/${c.sessionId}/result`;
    case "final":
      return `/play/${c.sessionId}/final`;
    default:
      return null;
  }
}

export function PlayerGame({ sessionId, roomCode }: { sessionId?: string; roomCode?: string }) {
  const [credentials, setCredentials] = useState<PlayerCredentials | null | undefined>(undefined);

  useEffect(() => {
    // Credentials live in localStorage, so they can only be read after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCredentials(sessionId ? loadCredentials(sessionId) : roomCode ? loadCredentialsByRoom(roomCode) : null);
  }, [sessionId, roomCode]);

  if (credentials === undefined) return <Loading />;
  if (credentials === null)
    return (
      <PlayerShell pattern="grid">
        <PlayerNoticeView kind="not-joined" roomCode={roomCode} />
      </PlayerShell>
    );
  return <LiveGame credentials={credentials} />;
}

function Loading() {
  const t = useT();
  return (
    <PlayerShell pattern="grid" drift>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-stage-muted" role="status">
        <NusaSpinner size={40} className="text-sun" />
        <p className="font-bold">{t("common.loading")}</p>
      </div>
    </PlayerShell>
  );
}

function LiveGame({ credentials }: { credentials: PlayerCredentials }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const provider = useMemo(() => providerFor(credentials.sessionId), [credentials.sessionId]);
  const role = useMemo(() => playerRole(credentials), [credentials]);
  const game = useGameSession(provider, credentials.sessionId, role);
  const [answers, setAnswers] = useState<Record<string, AnswerPayload>>({});
  const [resumeError, setResumeError] = useState<NoticeKind | null>(null);
  const [summary, setSummary] = useState<PlayerSummary | null>(null);
  const snapshot = game.snapshot;

  // Resume on mount: re-validate identity with the authority.
  useEffect(() => {
    let cancelled = false;
    void provider.resumePlayer(credentials).then((res) => {
      if (cancelled || res.ok) return;
      if (res.error === "kicked") setResumeError("kicked");
      else if (res.error === "ended") setResumeError("expired");
      else if (res.error === "not_found") {
        clearCredentials(credentials.sessionId);
        setResumeError("not-joined");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [provider, credentials]);

  // Seed the answer map from a resume snapshot (refresh after answering).
  const serverAnswer = snapshot?.self?.currentAnswer ?? null;
  const questionId = snapshot?.question?.id;
  useEffect(() => {
    if (serverAnswer && questionId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync authoritative answer after resume
      setAnswers((prev) => (prev[questionId] ? prev : { ...prev, [questionId]: serverAnswer }));
    }
  }, [serverAnswer, questionId]);

  const phase = snapshot?.phase;
  useEffect(() => {
    if (phase !== "finished" && phase !== "ended") return;
    void provider.getSummary(credentials).then(setSummary);
    if (phase === "finished") void getAudio().play("round-end");
  }, [phase, provider, credentials]);

  const submit = useCallback(
    (payload: AnswerPayload) => {
      if (!questionId) return;
      setAnswers((prev) => ({ ...prev, [questionId]: payload })); // optimistic lock
      void provider.submitAnswer(credentials, questionId, payload).then((res) => {
        if (res.status === "accepted" || res.status === "duplicate") return;
        // Rejected (late/invalid): release the optimistic lock so the UI stays truthful.
        setAnswers((prev) => {
          const next = { ...prev };
          delete next[questionId];
          return next;
        });
      });
    },
    [provider, credentials, questionId],
  );

  const view: View = (() => {
    if (resumeError) return resumeError;
    if (game.kicked || snapshot?.self?.kicked) return "kicked";
    if (!snapshot) return game.status === "offline" ? "offline" : "loading";
    if (snapshot.phase === "ended") return summary ? "final" : "host-ended";
    switch (snapshot.phase) {
      case "lobby":
        return "lobby";
      case "intro":
        return "intro";
      case "question":
        return snapshot.question && answers[snapshot.question.id] ? "waiting" : "question";
      case "reveal":
      case "leaderboard":
        return "result";
      case "finished":
        return "final";
    }
  })();

  // Keep the URL in step with the view without a navigation round-trip.
  useEffect(() => {
    const path = pathFor(view, credentials);
    if (path && window.location.pathname !== path) window.history.replaceState(null, "", path);
  }, [view, credentials]);

  // Clear identity once the game is over for good.
  useEffect(() => {
    if (view === "final" || view === "host-ended" || view === "kicked") clearCredentials(credentials.sessionId);
  }, [view, credentials.sessionId]);

  const selfResult = snapshot?.reveal?.results[credentials.playerId];
  const tone =
    view === "result" && selfResult
      ? selfResult.isCorrect
        ? "celebrate"
        : "miss"
      : view === "question"
        ? "focus"
        : "default";
  const pattern = view === "question" ? undefined : view === "result" ? "flow" : view === "final" ? "kawung" : "grid";

  return (
    <PlayerShell pattern={pattern} tone={tone} drift={view === "lobby" || view === "waiting"}>
      <ConnectionBanner status={game.status} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={
            view === "question" || view === "waiting" || view === "result" ? `${view}:${snapshot?.question?.id}` : view
          }
          className="flex flex-1 flex-col"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        >
          {view === "loading" && (
            <div className="flex flex-1 items-center justify-center">
              <NusaSpinner size={40} className="text-sun" label="Memuat" />
            </div>
          )}
          {view === "lobby" && snapshot && (
            <PlayerLobbyView
              snapshot={snapshot}
              nickname={credentials.nickname}
              avatarSeed={credentials.avatarSeed}
              onLeave={() => {
                void provider.leaveSession(credentials);
                clearCredentials(credentials.sessionId);
                router.push("/join");
              }}
            />
          )}
          {view === "intro" && snapshot?.upcoming && <PlayerIntroView upcoming={snapshot.upcoming} />}
          {view === "question" && snapshot?.question && (
            <PlayerQuestionView
              key={snapshot.question.id}
              question={snapshot.question}
              deadlineAt={snapshot.deadlineAt}
              clockOffsetMs={game.clockOffsetMs}
              paused={snapshot.paused}
              pausedRemainingMs={snapshot.pausedRemainingMs}
              submitted={answers[snapshot.question.id] ?? null}
              onSubmit={submit}
            />
          )}
          {view === "waiting" && snapshot?.question && (
            <PlayerWaitingView
              question={snapshot.question}
              answer={answers[snapshot.question.id]!}
              answeredCount={snapshot.answeredCount}
              totalPlayers={snapshot.players.length}
            />
          )}
          {view === "result" &&
            snapshot?.question &&
            snapshot.reveal &&
            (selfResult ? (
              <PlayerResultView
                question={snapshot.question}
                reveal={snapshot.reveal}
                result={selfResult}
                totalPlayers={snapshot.players.length}
              />
            ) : (
              <PlayerIntroView
                upcoming={{
                  index: snapshot.questionIndex,
                  total: snapshot.totalQuestions,
                  points: 0,
                  timeLimit: 0,
                  isFinal: false,
                }}
              />
            ))}
          {view === "final" && summary && <PlayerFinalView summary={summary} quizTitle={snapshot?.quizTitle ?? ""} />}
          {view === "final" && !summary && (
            <div className="flex flex-1 items-center justify-center">
              <NusaSpinner size={40} className="text-sun" label="Memuat" />
            </div>
          )}
          {(view === "kicked" ||
            view === "host-ended" ||
            view === "expired" ||
            view === "not-joined" ||
            view === "offline") && <PlayerNoticeView kind={view} roomCode={credentials.roomCode} />}
        </motion.div>
      </AnimatePresence>
    </PlayerShell>
  );
}
