"use client";

import { NusaQuestionProgress } from "@/components/game/NusaProgress";
import { NusaBadge } from "@/components/ui/NusaBadge";
import { formatRoomCode } from "@/lib/game/room-code";
import { useT } from "@/lib/i18n/client";

/** Top strip on the projector: round numeral + progress, topic, and the PIN for latecomers. */
export function HostHud({
  index,
  total,
  topic,
  roomCode,
  isFinal,
  right,
}: {
  index: number;
  total: number;
  topic?: string;
  roomCode: string;
  isFinal?: boolean;
  right?: React.ReactNode;
}) {
  const t = useT();
  return (
    <header className="flex items-center gap-[2vw]">
      <div className="flex items-baseline gap-4">
        <span className="hud-label text-[clamp(12px,1vw,18px)] text-stage-muted">
          {isFinal ? t("host.finalQuestion") : t("host.round")}
        </span>
        <span className="font-numeral text-[clamp(3rem,5.2vw,6rem)] leading-[0.8] text-kapas">
          {String(index + 1).padStart(2, "0")}
          <span className="text-stage-faint"> / {String(total).padStart(2, "0")}</span>
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {topic && (
          <div>
            <NusaBadge size="lg" tone={isFinal ? "sun" : "neutral"} className="text-[clamp(14px,1.1vw,20px)]">
              {topic}
            </NusaBadge>
          </div>
        )}
        <NusaQuestionProgress
          current={index}
          total={total}
          className="max-w-[28vw]"
          label={`${t("common.question")} ${index + 1} ${t("common.of")} ${total}`}
        />
      </div>
      <div className="text-right">
        <p className="hud-label text-[clamp(10px,0.75vw,14px)] text-stage-faint">{t("host.pinLabel")}</p>
        <p className="font-numeral mt-1 text-[clamp(1.5rem,2vw,2.5rem)] leading-none text-stage-muted">
          {formatRoomCode(roomCode)}
        </p>
      </div>
      {right}
    </header>
  );
}
