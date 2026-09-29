"use client";

import { NusaTimer } from "@/components/game/NusaTimer";
import { NusaQuestionProgress } from "@/components/game/NusaProgress";
import { useT } from "@/lib/i18n/client";

/** Top strip on the phone: question number + progress on the left, timer on the right. */
export function PlayerHud({
  index,
  total,
  timer,
}: {
  index: number;
  total: number;
  timer?: {
    deadlineAt: number | null;
    clockOffsetMs: number;
    paused: boolean;
    pausedRemainingMs: number | null;
    totalSeconds: number;
  };
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span className="hud-label text-stage-muted">{t("play.questionLabel")}</span>
          <span className="font-numeral text-4xl leading-none text-kapas">
            {String(index + 1).padStart(2, "0")}
            <span className="text-2xl text-stage-faint"> / {String(total).padStart(2, "0")}</span>
          </span>
        </p>
        <NusaQuestionProgress
          current={index}
          total={total}
          className="mt-3"
          label={`${t("common.question")} ${index + 1} ${t("common.of")} ${total}`}
        />
      </div>
      {timer && (
        <NusaTimer
          size="player"
          totalSeconds={timer.totalSeconds}
          deadlineAt={timer.deadlineAt}
          clockOffsetMs={timer.clockOffsetMs}
          paused={timer.paused}
          pausedRemainingMs={timer.pausedRemainingMs}
        />
      )}
    </div>
  );
}
