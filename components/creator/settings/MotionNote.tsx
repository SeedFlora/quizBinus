"use client";

import { useReducedMotion } from "motion/react";
import { NusaBadge } from "@/components/ui/NusaBadge";
import { useT } from "@/lib/i18n/client";

/**
 * Motion follows the operating system's "reduce motion" setting (the accessible
 * default), so this is a report of the current state rather than a toggle.
 */
export function MotionNote() {
  const t = useT();
  const reduced = useReducedMotion() === true;
  return (
    <div className="grid gap-3">
      <NusaBadge tone={reduced ? "desk-primary" : "desk"} size="md" className="justify-self-start">
        {reduced ? t("settings.motionStatusReduced") : t("settings.motionStatusFull")}
      </NusaBadge>
      <p className="max-w-[60ch] text-[15px] leading-relaxed text-desk-text">
        {reduced ? t("settings.motionReduced") : t("settings.motionFull")}
      </p>
    </div>
  );
}
