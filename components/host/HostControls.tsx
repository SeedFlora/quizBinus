"use client";

import { Expand, Minimize, Pause, Play, SkipForward, Square, Volume2, VolumeX, Eye, EyeOff } from "lucide-react";
import { NusaButton } from "@/components/ui/NusaButton";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";

export interface HostAction {
  label: string;
  run: () => void;
  icon?: React.ReactNode;
}

/**
 * Lecturer control bar, bottom-right. One oversized primary action (also bound to
 * Space / → / PageDown so presentation clickers work) plus compact utilities.
 */
export function HostControls({
  primary,
  paused,
  canPause,
  canSkip,
  showLeaderboard,
  fullscreen,
  muted,
  busy,
  onPauseToggle,
  onSkip,
  onEnd,
  onFullscreen,
  onMute,
  onToggleLeaderboard,
  className,
}: {
  primary: HostAction | null;
  paused: boolean;
  canPause: boolean;
  canSkip: boolean;
  showLeaderboard: boolean;
  fullscreen: boolean;
  muted: boolean;
  busy?: boolean;
  onPauseToggle: () => void;
  onSkip: () => void;
  onEnd: () => void;
  onFullscreen: () => void;
  onMute: () => void;
  onToggleLeaderboard: () => void;
  className?: string;
}) {
  const t = useT();
  const tool =
    "text-kapas/80 hover:text-kapas hover:bg-kapas/10 grid size-11 place-items-center rounded-[10px_4px_14px_4px] transition-colors disabled:opacity-30";
  return (
    <div className={cn("flex items-center gap-3", className)} role="toolbar" aria-label={t("host.controls")}>
      <div className="flex items-center gap-1 rounded-[12px_4px_18px_4px] bg-stage-raised/80 p-1 backdrop-blur">
        {canPause && (
          <button
            type="button"
            className={tool}
            onClick={onPauseToggle}
            aria-label={paused ? t("host.resume") : t("host.pause")}
            title={`${paused ? t("host.resume") : t("host.pause")} (P)`}
          >
            {paused ? <Play size={20} /> : <Pause size={20} />}
          </button>
        )}
        {canSkip && (
          <button type="button" className={tool} onClick={onSkip} aria-label={t("host.skip")} title={t("host.skip")}>
            <SkipForward size={20} />
          </button>
        )}
        <button
          type="button"
          className={tool}
          onClick={onToggleLeaderboard}
          aria-pressed={showLeaderboard}
          aria-label={showLeaderboard ? t("host.hideLeaderboard") : t("host.showLeaderboard")}
          title={showLeaderboard ? t("host.hideLeaderboard") : t("host.showLeaderboard")}
        >
          {showLeaderboard ? <Eye size={20} /> : <EyeOff size={20} />}
        </button>
        <button
          type="button"
          className={tool}
          onClick={onMute}
          aria-pressed={muted}
          aria-label={muted ? t("common.unmute") : t("common.mute")}
          title="M"
        >
          {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
        <button
          type="button"
          className={tool}
          onClick={onFullscreen}
          aria-label={t("host.fullscreen")}
          title={`${t("host.fullscreen")} (F)`}
        >
          {fullscreen ? <Minimize size={20} /> : <Expand size={20} />}
        </button>
        <button type="button" className={tool} onClick={onEnd} aria-label={t("host.end")} title={t("host.end")}>
          <Square size={18} />
        </button>
      </div>
      {primary && (
        <NusaButton
          size="lg"
          variant="energy"
          onClick={primary.run}
          loading={busy}
          icon={primary.icon}
          className="min-w-[16rem] text-[clamp(1rem,1.2vw,1.35rem)]"
        >
          {primary.label}
        </NusaButton>
      )}
    </div>
  );
}
