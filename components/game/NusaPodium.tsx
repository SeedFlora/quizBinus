"use client";

import { motion, useReducedMotion } from "motion/react";
import type { LeaderboardEntry } from "@/lib/game/types";
import { NusaAvatar } from "./NusaAvatar";
import { NusaScore } from "./NusaScore";
import { NusaPattern } from "@/components/brand/NusaPattern";
import { cn } from "@/lib/cn";

const STEPS = {
  1: { height: "46vh", tone: "nf-sun", ink: "text-binus-950", order: 2, delay: 2 },
  2: { height: "34vh", tone: "nf-kapas", ink: "text-binus-950", order: 1, delay: 1 },
  3: { height: "25vh", tone: "nf-energy", ink: "text-[#1d0d00]", order: 3, delay: 0 },
} as const;

/**
 * Three NUSA FRAME pillars rise in sequence (3rd → 2nd → 1st). Winners stand on
 * their pillar; the rank numeral is carved into it. Not a copy of any game's podium:
 * the pillars share the product's cut/notch geometry and cast no heavy shadows.
 */
export function NusaPodium({
  entries,
  stagger = 0.45,
  onRevealed,
}: {
  entries: LeaderboardEntry[];
  stagger?: number;
  onRevealed?: (rank: 1 | 2 | 3) => void;
}) {
  const reduce = useReducedMotion();
  const top = ([1, 2, 3] as const)
    .map((rank) => entries.find((e) => e.rank === rank))
    .filter(Boolean) as LeaderboardEntry[];

  return (
    <ol className="flex h-full items-end justify-center gap-[1.6vw]" aria-label="Podium">
      {top
        .slice()
        .sort((a, b) => STEPS[a.rank as 1 | 2 | 3].order - STEPS[b.rank as 1 | 2 | 3].order)
        .map((entry) => {
          const step = STEPS[entry.rank as 1 | 2 | 3];
          const delay = reduce ? 0 : 0.4 + step.delay * stagger * 2;
          return (
            <li
              key={entry.playerId}
              className="flex w-[min(24vw,420px)] flex-col items-center"
              style={{ order: step.order }}
            >
              <motion.div
                className="mb-[2vh] flex w-full flex-col items-center text-center"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: delay + 0.55, type: "spring", stiffness: 260, damping: 16 }}
                onAnimationComplete={() => onRevealed?.(entry.rank as 1 | 2 | 3)}
              >
                <NusaAvatar seed={entry.avatarSeed} size={entry.rank === 1 ? 150 : 112} ring={entry.rank === 1} />
                {/* A winner's name wraps (two lines max) rather than losing its end to an ellipsis. */}
                <p className="mt-3 line-clamp-2 max-w-full text-[clamp(1.5rem,2.4vw,3rem)] leading-tight font-extrabold text-balance [overflow-wrap:anywhere] text-kapas">
                  {entry.nickname}
                </p>
                <p className="font-numeral text-[clamp(2rem,3.2vw,4rem)] leading-none text-sun">
                  <NusaScore value={entry.score} delay={delay + 0.6} suffix=" PTS" />
                </p>
              </motion.div>
              <motion.div
                className={cn(
                  "nf nf-xl relative w-full origin-bottom overflow-hidden",
                  step.tone,
                  entry.rank % 2 === 0 && "nf-flip",
                )}
                style={{ height: step.height }}
                initial={reduce ? { opacity: 0 } : { scaleY: 0 }}
                animate={{ scaleY: 1, opacity: 1 }}
                transition={{ delay, type: "spring", stiffness: 120, damping: 18 }}
              >
                {/* Kawung woven into the pillar (DESIGN §5), clipped to the frame and mirrored with it. */}
                <NusaPattern
                  kind="kawung"
                  intensity="loud"
                  scale={64}
                  fade="bottom"
                  className={cn("nf-clip text-binus-950", entry.rank % 2 === 0 && "-scale-x-100")}
                />
                <span
                  className={cn(
                    "font-numeral absolute inset-x-0 top-[3vh] text-center text-[clamp(6rem,13vh,12rem)] leading-none",
                    step.ink,
                  )}
                >
                  {entry.rank}
                </span>
              </motion.div>
            </li>
          );
        })}
    </ol>
  );
}
