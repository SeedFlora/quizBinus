"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/** ▲2 / ▼1 / — movement chip. Direction is shown by glyph AND text, not colour alone. */
export function RankMovement({
  previous,
  current,
  className,
  size = "md",
}: {
  previous: number | null;
  current: number;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const delta = previous === null ? 0 : previous - current;
  const text = size === "lg" ? "text-2xl" : size === "sm" ? "text-xs" : "text-sm";
  if (delta > 0)
    return (
      <span className={cn("tabular font-extrabold text-sun", text, className)} aria-label={`naik ${delta}`}>
        ▲{delta}
      </span>
    );
  if (delta < 0)
    return (
      <span className={cn("tabular font-extrabold text-miss", text, className)} aria-label={`turun ${-delta}`}>
        ▼{-delta}
      </span>
    );
  return (
    <span className={cn("font-extrabold text-stage-faint", text, className)} aria-label="tetap">
      —
    </span>
  );
}

/**
 * Signature rank transition: the old rank is shown first, then physically slides
 * up and out while the new rank drops into place.
 */
export function NusaRankTransition({
  from,
  to,
  delay = 600,
  className,
}: {
  from: number | null;
  to: number;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [settled, setSettled] = useState(from === null || from === to);
  // Reset when a new result arrives (state adjusted during render, not in an effect).
  const [pair, setPair] = useState({ from, to });
  if (pair.from !== from || pair.to !== to) {
    setPair({ from, to });
    setSettled(from === null || from === to);
  }
  useEffect(() => {
    if (settled) return;
    const id = window.setTimeout(() => setSettled(true), reduce ? 0 : delay);
    return () => window.clearTimeout(id);
  }, [settled, delay, reduce]);
  const shown = settled ? to : (from ?? to);

  const up = from !== null && to < from;
  return (
    <span
      className={cn("font-numeral relative inline-flex overflow-hidden leading-[0.85]", className)}
      aria-label={`#${to}`}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={shown}
          aria-hidden="true"
          initial={reduce ? { opacity: 0 } : { y: up ? "90%" : "-90%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { y: up ? "-90%" : "90%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
        >
          #{String(shown).padStart(2, "0")}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
