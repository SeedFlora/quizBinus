"use client";

import { motion, useReducedMotion } from "motion/react";
import type { UpcomingQuestion } from "@/lib/game/types";
import { useT } from "@/lib/i18n/client";

/**
 * Signature question intro: the round numeral swells out of the stage, a parang
 * slash wipes across, and the topic lands. ~3 s, then the question opens.
 */
export function HostIntroView({ upcoming, courseName }: { upcoming: UpcomingQuestion; courseName: string }) {
  const t = useT();
  const reduce = useReducedMotion();
  const n = String(upcoming.index + 1).padStart(2, "0");
  const remaining = upcoming.total - upcoming.index - 1;

  return (
    // No overflow clip here: the ghost numeral and slash bleed to the projector edge
    // (the host canvas clips), instead of stopping at the safe-area padding.
    <div className="relative flex h-full flex-col items-start justify-center">
      {/* ghost numeral */}
      <motion.span
        aria-hidden="true"
        className="font-numeral pointer-events-none absolute -right-[4vw] bottom-[-14vh] text-[78vh] leading-[0.8] text-kapas/[0.06]"
        initial={reduce ? { opacity: 0 } : { scale: 0.55, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      >
        {n}
      </motion.span>

      {/* parang slash wipe */}
      {!reduce && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute top-0 -bottom-4 w-[18vw] bg-energy"
          style={{ skewX: "-18deg" }}
          initial={{ left: "-30vw" }}
          animate={{ left: "120vw" }}
          transition={{ duration: 0.75, ease: [0.83, 0, 0.17, 1], delay: 0.1 }}
        />
      )}

      <motion.p
        className="hud-label relative text-[clamp(16px,1.6vw,30px)] text-stage-muted"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        {upcoming.isFinal ? t("host.finalQuestion") : t("host.round")} · {courseName}
      </motion.p>
      <motion.p
        className="font-numeral relative mt-[2vh] text-[clamp(8rem,24vh,18rem)] leading-[0.8] text-kapas"
        initial={reduce ? { opacity: 0 } : { x: -60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.55, type: "spring", stiffness: 220, damping: 24 }}
      >
        {n}
        <span className="text-stage-faint"> / {String(upcoming.total).padStart(2, "0")}</span>
      </motion.p>
      {upcoming.topic && (
        <motion.h1
          className="font-display-wide relative mt-[3vh] max-w-[70vw] text-[clamp(3rem,7vw,8rem)] leading-[0.9] text-sun uppercase"
          initial={reduce ? { opacity: 0 } : { y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.75, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          {upcoming.topic}
        </motion.h1>
      )}
      <motion.p
        className="relative mt-[4vh] text-[clamp(1.25rem,2vw,2.25rem)] font-bold text-stage-muted"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1 }}
      >
        {upcoming.isFinal
          ? t("host.betweenRoundLast")
          : upcoming.index === 0
            ? t("host.betweenRound1")
            : t("host.betweenRound2", { count: remaining + 1 })}
      </motion.p>
    </div>
  );
}
