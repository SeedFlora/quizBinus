"use client";

import { useSyncExternalStore } from "react";
import { Music, Square, Volume2 } from "lucide-react";
import { Switch } from "@/components/ui/desk/Field";
import { NusaButton } from "@/components/ui/NusaButton";
import { getAudio } from "@/lib/audio/engine";
import { isMusicEnabled, setMusicEnabled, MUSIC_PREF_KEY } from "@/lib/audio/music";
import { useSound } from "@/lib/audio/use-sound";
import { useT } from "@/lib/i18n/client";
import { useMusicPreview } from "./use-music-preview";

function subscribeMusic(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === MUSIC_PREF_KEY) onChange();
  };
  window.addEventListener("nq-music-change", onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("nq-music-change", onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Sound effects + background music, both per device (the projector laptop is the one that matters). */
export function AudioSettings() {
  const t = useT();
  const { muted, play } = useSound();
  const music = useSyncExternalStore(subscribeMusic, isMusicEnabled, () => true);
  const preview = useMusicPreview();

  return (
    <div className="grid gap-6">
      <Switch
        checked={!muted}
        onChange={(on) => getAudio().setMuted(!on)}
        label={t("settings.sound")}
        description={t("settings.soundHint")}
      />
      <Switch
        checked={music}
        onChange={setMusicEnabled}
        label={t("settings.music")}
        description={t("settings.musicHint")}
      />

      <div className="flex flex-wrap items-center gap-3">
        <NusaButton
          variant="desk-quiet"
          size="sm"
          disabled={muted}
          icon={<Volume2 size={16} aria-hidden="true" />}
          onClick={() => {
            getAudio().unlock();
            play("correct");
          }}
        >
          {t("settings.testSound")}
        </NusaButton>
        <NusaButton
          variant="desk-quiet"
          size="sm"
          aria-pressed={preview.playing}
          icon={
            preview.playing ? (
              <Square size={14} aria-hidden="true" fill="currentColor" />
            ) : (
              <Music size={16} aria-hidden="true" />
            )
          }
          onClick={preview.playing ? preview.stop : preview.start}
        >
          {preview.playing ? t("settings.stopMusic") : t("settings.previewMusic")}
        </NusaButton>
        <p aria-live="polite" className="text-sm font-semibold text-desk-muted">
          {preview.mood && t("settings.musicNow", { mood: t(`settings.musicMoods.${preview.mood}`) })}
        </p>
      </div>
      {!music && <p className="-mt-3 text-[13px] text-desk-faint">{t("settings.musicOffNote")}</p>}
    </div>
  );
}
