"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";

/**
 * Question progress as a row of parang-slashed segments: done, current (pulsing)
 * and upcoming. Each segment is slanted, so the bar reads as forward motion.
 */
export function NusaQuestionProgress({
  current,
  total,
  className,
  label,
}: {
  /** 0-based index of the current question. */
  current: number;
  total: number;
  className?: string;
  label: string;
}) {
  const reduce = useReducedMotion();
  return (
    <div
      className={cn("flex w-full items-center gap-[3px]", className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current + 1}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "relative h-2 flex-1 -skew-x-[24deg] overflow-hidden rounded-[2px]",
            i < current ? "bg-sky" : i === current ? "bg-sun" : "bg-kapas/15",
          )}
        >
          {i === current && !reduce && (
            <motion.span
              className="absolute inset-0 bg-kapas"
              initial={{ x: "-100%" }}
              animate={{ x: "100%" }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              style={{ opacity: 0.45 }}
            />
          )}
        </span>
      ))}
    </div>
  );
}

/** Continuous bar (e.g. 34 / 42 answered) with a slashed leading edge. */
export function NusaMeter({
  value,
  max,
  className,
  label,
  tone = "sky",
}: {
  value: number;
  max: number;
  className?: string;
  label: string;
  tone?: "sky" | "sun" | "energy";
}) {
  const reduce = useReducedMotion();
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div
      className={cn("relative h-3 w-full overflow-hidden rounded-[3px] bg-kapas/10", className)}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <motion.div
        className={cn(
          "absolute inset-y-0 left-0",
          tone === "sky" && "bg-sky",
          tone === "sun" && "bg-sun",
          tone === "energy" && "bg-energy",
        )}
        style={{ clipPath: "polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%)" }}
        initial={false}
        animate={{ width: `calc(${pct * 100}% + ${pct > 0 && pct < 1 ? 8 : 0}px)` }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 180, damping: 26 }}
      />
    </div>
  );
}
