"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MusicEngine, type MusicMood } from "@/lib/audio/music";

export type PreviewMood = Extract<MusicMood, "lobby" | "question" | "urgent" | "results">;

/** The preview walks through the moods a class hears, so the lecturer can judge the arc, not one loop. */
const SCRIPT: Array<{ mood: PreviewMood; ms: number }> = [
  { mood: "lobby", ms: 8000 },
  { mood: "question", ms: 8000 },
  { mood: "urgent", ms: 5000 },
  { mood: "results", ms: 7000 },
];

interface Running {
  ctx: AudioContext;
  engine: MusicEngine;
  timers: number[];
}

/**
 * Plays the procedural soundtrack in a private AudioContext (created on the click,
 * so it is always a user gesture). Stops itself at the end, on demand, or on unmount.
 */
export function useMusicPreview() {
  const running = useRef<Running | null>(null);
  const [mood, setMood] = useState<PreviewMood | null>(null);

  const stop = useCallback(() => {
    const current = running.current;
    if (!current) return;
    running.current = null;
    current.timers.forEach((id) => window.clearTimeout(id));
    current.engine.setMood("off");
    // Let the fade-out finish before tearing the graph down.
    window.setTimeout(() => {
      current.engine.dispose();
      void current.ctx.close().catch(() => undefined);
    }, 1500);
    setMood(null);
  }, []);

  const start = useCallback(() => {
    if (running.current) return;
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const engine = new MusicEngine(ctx);
    engine.setVolume(0.45);
    const timers: number[] = [];
    let at = 0;
    for (const step of SCRIPT) {
      timers.push(
        window.setTimeout(() => {
          engine.setMood(step.mood);
          setMood(step.mood);
        }, at),
      );
      at += step.ms;
    }
    timers.push(window.setTimeout(stop, at));
    running.current = { ctx, engine, timers };
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { mood, playing: mood !== null, start, stop };
}
