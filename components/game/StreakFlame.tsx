"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";

/**
 * Streak energy built from stacked parang blades: one blade per streak step, up to
 * five. It grows; it never shrinks with a flourish (a lost streak just resets).
 */
export function StreakFlame({ streak, size = 40, className }: { streak: number; size?: number; className?: string }) {
  const reduce = useReducedMotion();
  const blades = Math.min(5, Math.max(0, streak));
  const colors = ["#FFC82E", "#FFB224", "#F7861F", "#F76B1F", "#E0262F"];
  return (
    <svg
      viewBox="0 0 40 48"
      width={size}
      height={size * 1.2}
      className={cn("shrink-0 overflow-visible", className)}
      aria-hidden="true"
    >
      {Array.from({ length: 5 }, (_, i) => {
        const active = i < blades;
        const y = 40 - i * 8;
        return (
          <motion.path
            key={i}
            d={`M${6 + i * 1.5} ${y} L${18 + i * 1.5} ${y - 14} H${26 - i * 0.5} L${14 + i} ${y} Z`}
            fill={active ? colors[i] : "rgb(255 249 238 / 0.12)"}
            initial={false}
            animate={
              active && !reduce ? { scale: [0.6, 1.12, 1], opacity: 1 } : { scale: 1, opacity: active ? 1 : 0.6 }
            }
            transition={{ duration: 0.5, delay: active ? i * 0.06 : 0 }}
            style={{ transformOrigin: "20px 40px" }}
          />
        );
      })}
    </svg>
  );
}
