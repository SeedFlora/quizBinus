"use client";

import { NusaBadge } from "@/components/ui/NusaBadge";
import { useT } from "@/lib/i18n/client";
import type { SessionStatus } from "./session-records";

/** Live sessions carry the one warm accent on the page; finished ones stay quiet. */
export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const t = useT();
  if (status === "live") {
    return (
      <NusaBadge tone="energy" size="sm" icon={<LiveDot />}>
        {t("sessions.live")}
      </NusaBadge>
    );
  }
  if (status === "lobby") {
    return (
      <NusaBadge tone="desk-primary" size="sm">
        {t("sessions.lobby")}
      </NusaBadge>
    );
  }
  return (
    <NusaBadge tone="desk" size="sm">
      {t("sessions.ended")}
    </NusaBadge>
  );
}

function LiveDot() {
  return (
    <span aria-hidden="true" className="relative grid size-2 place-items-center">
      <span className="absolute inset-0 animate-pulse-ring rounded-full bg-current" />
      <span className="relative size-2 rounded-full bg-current" />
    </span>
  );
}
