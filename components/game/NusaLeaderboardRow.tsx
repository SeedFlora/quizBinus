"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { transition } from "@/lib/motion";
import type { LeaderboardEntry } from "@/lib/game/types";
import { NusaAvatar } from "./NusaAvatar";
import { RankMovement } from "./NusaRank";
import { NusaScore } from "./NusaScore";
import { StreakFlame } from "./StreakFlame";

const TOP_TONES: Record<number, string> = {
  1: "nf-sun",
  2: "nf-kapas",
  3: "nf-energy",
};

/**
 * One leaderboard row. Uses `layout` so reordering physically slides rows into
 * their new positions. Top three get filled frames; everyone else sits on navy.
 * Alternate rows mirror the frame geometry for a woven rhythm.
 */
export function NusaLeaderboardRow({
  entry,
  size = "host",
  self,
  countFrom,
  className,
  style,
}: {
  entry: LeaderboardEntry;
  size?: "host" | "phone";
  /** Highlight the viewer's own row. */
  self?: boolean;
  /** Animate score up from this value. */
  countFrom?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const top = entry.rank <= 3;
  const host = size === "host";
  const tone = TOP_TONES[entry.rank] ?? (self ? "nf-panel" : "nf-solid");
  const dark = top; // filled frames use dark ink

  return (
    <motion.li
      layout
      layoutId={`lb-${entry.playerId}`}
      transition={transition.layout}
      className={cn(
        "nf grid items-center",
        host
          ? "nf-lg min-h-[clamp(84px,11.5vh,150px)] gap-[1.4vw] py-[1vh] pr-[2.2vw] pl-[1vw]"
          : "nf-md gap-3 py-2 pr-4 pl-2",
        tone,
        entry.rank % 2 === 0 && "nf-flip",
        self && !top && "[--nf-stroke-w:2.5px] [--nf-stroke:var(--binus-yellow)]",
        className,
      )}
      style={{
        gridTemplateColumns: host ? "clamp(96px,8vw,150px) auto 1fr auto auto" : "52px auto 1fr auto",
        ...style,
      }}
    >
      <span
        className={cn(
          "font-numeral text-center leading-[0.85]",
          host ? (top ? "text-[clamp(4rem,9.5vh,8rem)]" : "text-[clamp(3rem,7vh,6rem)]") : "text-4xl",
          dark ? "text-binus-950" : "text-kapas/80",
        )}
        aria-label={`Peringkat ${entry.rank}`}
      >
        {String(entry.rank).padStart(2, "0")}
      </span>
      <span className={host ? (top ? "size-[clamp(64px,9vh,120px)]" : "size-[clamp(52px,7vh,96px)]") : undefined}>
        <NusaAvatar seed={entry.avatarSeed} size={host ? 120 : 40} className={host ? "!size-full" : undefined} />
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            "block truncate font-extrabold",
            host
              ? top
                ? "text-[clamp(2rem,4.4vh,3.5rem)] leading-tight"
                : "text-[clamp(1.6rem,3.4vh,2.75rem)] leading-tight"
              : "text-base",
            dark ? "text-binus-950" : "text-kapas",
          )}
        >
          {entry.nickname}
        </span>
        {host && entry.streak >= 2 && (
          <span
            className={cn("hud-label mt-1 inline-flex items-center gap-1.5", dark ? "text-binus-950/70" : "text-sun")}
          >
            ×{entry.streak} STREAK
          </span>
        )}
      </span>
      {host && (
        <span className="flex items-center gap-3">
          {entry.streak >= 2 && <StreakFlame streak={entry.streak} size={30} />}
          <RankMovement
            previous={entry.previousRank}
            current={entry.rank}
            size="lg"
            className={dark ? "!text-binus-950" : undefined}
          />
        </span>
      )}
      <span className={cn("text-right", dark ? "text-binus-950" : "text-kapas")}>
        <NusaScore
          value={entry.score}
          from={countFrom ?? entry.score - entry.lastPoints}
          className={host ? "text-[clamp(2.5rem,6.2vh,5rem)] leading-none" : "text-2xl leading-none"}
        />
        {!host && (
          <RankMovement
            previous={entry.previousRank}
            current={entry.rank}
            size="sm"
            className={cn("ml-2", dark && "!text-binus-950")}
          />
        )}
      </span>
    </motion.li>
  );
}
