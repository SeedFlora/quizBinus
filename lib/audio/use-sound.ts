"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { getAudio, type SoundCue } from "./engine";

export function useSound() {
  const muted = useSyncExternalStore(
    (cb) => getAudio().onMuteChange(cb),
    () => getAudio().isMuted(),
    () => false,
  );

  const play = useCallback((cue: SoundCue) => void getAudio().play(cue), []);
  const toggleMute = useCallback(() => getAudio().setMuted(!getAudio().isMuted()), []);

  return { muted, play, toggleMute };
}

/** Unlocks WebAudio on the first user gesture anywhere on the page. */
export function useAudioUnlock() {
  useEffect(() => {
    const unlock = () => getAudio().unlock();
    const opts = { once: true, passive: true } as const;
    window.addEventListener("pointerdown", unlock, opts);
    window.addEventListener("keydown", unlock, opts);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
}
