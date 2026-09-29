"use client";

import { motion, useReducedMotion } from "motion/react";
import type { UpcomingQuestion } from "@/lib/game/types";
import { NusaBadge } from "@/components/ui/NusaBadge";
import { useT } from "@/lib/i18n/client";

/** Question intro on the phone: the round numeral expands, then "Bersiap…". */
export function PlayerIntroView({ upcoming }: { upcoming: UpcomingQuestion }) {
  const t = useT();
  const reduce = useReducedMotion();
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center text-center">
      <motion.span
        aria-hidden="true"
        className="font-numeral pointer-events-none absolute text-[62vw] leading-none text-kapas/[0.07] sm:text-[18rem]"
        initial={reduce ? { opacity: 0 } : { scale: 0.55, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        {String(upcoming.index + 1).padStart(2, "0")}
      </motion.span>
      <p className="hud-label relative text-stage-muted">
        {upcoming.isFinal ? t("host.finalQuestion") : t("play.questionLabel")}
      </p>
      <motion.p
        className="font-numeral relative mt-3 text-[7rem] leading-[0.8] text-kapas"
        initial={reduce ? { opacity: 0 } : { y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15, type: "spring", stiffness: 260, damping: 22 }}
      >
        {String(upcoming.index + 1).padStart(2, "0")}
        <span className="text-5xl text-stage-faint"> / {String(upcoming.total).padStart(2, "0")}</span>
      </motion.p>
      {upcoming.topic && (
        <motion.div
          className="relative mt-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
        >
          <NusaBadge size="lg" tone={upcoming.isFinal ? "sun" : "neutral"}>
            {upcoming.topic}
          </NusaBadge>
        </motion.div>
      )}
      <p className="relative mt-8 text-lg font-bold text-stage-muted">{t("play.getReady")}</p>
    </div>
  );
}
