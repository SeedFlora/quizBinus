"use client";

import Link from "next/link";
import { DoorClosed, SearchX, UserX, WifiOff } from "lucide-react";
import { NusaButton } from "@/components/ui/NusaButton";
import { useT } from "@/lib/i18n/client";
import type { TranslationKey } from "@/lib/i18n/config";

export type NoticeKind = "not-joined" | "kicked" | "host-ended" | "expired" | "offline";

const CONTENT: Record<
  NoticeKind,
  { title: TranslationKey; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }
> = {
  "not-joined": { title: "errors.invalidCode", icon: SearchX },
  kicked: { title: "errors.kicked", icon: UserX },
  "host-ended": { title: "errors.hostEnded", icon: DoorClosed },
  expired: { title: "errors.expired", icon: DoorClosed },
  offline: { title: "errors.network", icon: WifiOff },
};

/** Terminal/error states: say what happened and give one clear next step. */
export function PlayerNoticeView({ kind, roomCode }: { kind: NoticeKind; roomCode?: string }) {
  const t = useT();
  const { title, icon: Icon } = CONTENT[kind];
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center" role="status">
      <div className="nf nf-xl nf-panel grid size-32 place-items-center text-kapas">
        <Icon size={56} strokeWidth={2.25} />
      </div>
      <h1 className="font-display-tight mt-8 max-w-[18ch] text-3xl leading-tight text-balance text-kapas">
        {t(title)}
      </h1>
      {kind === "not-joined" && <p className="mt-3 text-stage-muted">{t("errors.invalidCodeHint")}</p>}
      <div className="mt-10 w-full max-w-xs">
        {kind === "offline" ? (
          <NusaButton size="lg" block onClick={() => window.location.reload()}>
            {t("common.retry")}
          </NusaButton>
        ) : (
          <Link
            href={roomCode ? `/join?room=${roomCode}` : "/join"}
            className="nf nf-md nq-btn w-full"
            data-variant="energy"
            data-size="lg"
          >
            <span className="nq-btn__label">{t("join.cta")}</span>
          </Link>
        )}
      </div>
    </div>
  );
}
