"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Music2 } from "lucide-react";
import { getAudio } from "@/lib/audio/engine";
import { isMusicEnabled, MusicEngine, type MusicMood } from "@/lib/audio/music";
import { useSound } from "@/lib/audio/use-sound";
import { useCountdown } from "@/lib/game/use-countdown";
import type { SessionSnapshot } from "@/lib/game/types";
import { useT } from "@/lib/i18n/client";

function subscribeMusicPref(cb: () => void) {
  window.addEventListener("nq-music-change", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("nq-music-change", cb);
    window.removeEventListener("storage", cb);
  };
}

function moodFor(snapshot: SessionSnapshot | null, secondsLeft: number): MusicMood {
  if (!snapshot) return "off";
  switch (snapshot.phase) {
    case "lobby":
      return "lobby";
    case "intro":
      return "intro";
    case "question":
      if (snapshot.paused) return "lobby";
      return secondsLeft > 0 && secondsLeft <= 5 ? "urgent" : "question";
    case "reveal":
    case "leaderboard":
      return "results";
    case "finished":
    case "ended":
      return "podium";
  }
}

/**
 * Projector-only adaptive music. Phones never play music (40 phones in one room
 * would be chaos); they keep short SFX. Browsers block audio until a gesture, so a
 * small "Nyalakan musik" chip appears until the lecturer clicks anything.
 */
export function HostMusic({ snapshot, clockOffsetMs }: { snapshot: SessionSnapshot | null; clockOffsetMs: number }) {
  const t = useT();
  const { muted } = useSound();
  const enabledPref = useSyncExternalStore(subscribeMusicPref, isMusicEnabled, () => true);
  const [unlocked, setUnlocked] = useState(false);
  const engine = useRef<MusicEngine | null>(null);

  const { seconds } = useCountdown({
    deadlineAt: snapshot?.phase === "question" ? snapshot.deadlineAt : null,
    clockOffsetMs,
    paused: snapshot?.paused,
    pausedRemainingMs: snapshot?.pausedRemainingMs,
  });

  useEffect(() => {
    const off = getAudio().onUnlock((ctx) => {
      engine.current ??= new MusicEngine(ctx);
      setUnlocked(true);
    });
    return () => {
      off();
      engine.current?.dispose();
      engine.current = null;
    };
  }, []);

  const mood = moodFor(snapshot, seconds);
  const active = enabledPref && !muted;
  useEffect(() => {
    engine.current?.setMood(active ? mood : "off");
  }, [mood, active, unlocked]);

  return (
    <AnimatePresence>
      {!unlocked && enabledPref && !muted && snapshot && (
        <motion.button
          type="button"
          onClick={() => getAudio().unlock()}
          className="nf nf-md nf-ghost absolute bottom-[var(--host-safe)] left-[var(--host-safe)] z-20 flex min-h-11 items-center gap-2 px-4 text-sm font-bold text-kapas"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
        >
          <Music2 size={18} aria-hidden="true" />
          {t("host.enableMusic")}
        </motion.button>
      )}
    </AnimatePresence>
  );
}
