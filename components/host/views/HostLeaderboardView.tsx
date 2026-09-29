"use client";

import { useEffect, useMemo, useState } from "react";
import { LayoutGroup, useReducedMotion } from "motion/react";
import { NusaLeaderboardRow } from "@/components/game/NusaLeaderboardRow";
import type { LeaderboardEntry, SessionSnapshot } from "@/lib/game/types";
import { useT } from "@/lib/i18n/client";
import { getAudio } from "@/lib/audio/engine";

const TOP = 5;

/**
 * Top five, not a spreadsheet. Rows first appear in their PREVIOUS order, then
 * physically slide into the new standings, so the room sees who overtook whom.
 */
export function HostLeaderboardView({ snapshot }: { snapshot: SessionSnapshot }) {
  const t = useT();
  const reduce = useReducedMotion();
  const entries = snapshot.leaderboard;
  const [settled, setSettled] = useState(Boolean(reduce));

  useEffect(() => {
    if (reduce) return;
    const id = window.setTimeout(() => {
      setSettled(true);
      if (entries.some((e) => e.rank <= TOP && e.previousRank !== null && e.previousRank > e.rank))
        void getAudio().play("rank-up");
    }, 1100);
    return () => window.clearTimeout(id);
  }, [reduce, entries]);

  const rows: LeaderboardEntry[] = useMemo(() => {
    const top = entries.filter((e) => e.rank <= TOP);
    if (settled) return top;
    // Before settling: show who is in the new top five, ordered by where they were,
    // holding their previous score still (lastPoints 0, so the row doesn't count up
    // from "previous minus this round" and flash negative numbers).
    return [...top]
      .sort((a, b) => (a.previousRank ?? a.rank) - (b.previousRank ?? b.rank))
      .map((e, i) => ({ ...e, rank: i + 1, score: e.score - e.lastPoints, lastPoints: 0 }));
  }, [entries, settled]);

  const remaining = snapshot.totalQuestions - snapshot.questionIndex - 1;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-end justify-between gap-6">
        <div>
          <p className="hud-label text-[clamp(14px,1.2vw,22px)] text-stage-muted">
            {t("host.round")} {String(snapshot.questionIndex + 1).padStart(2, "0")} /{" "}
            {String(snapshot.totalQuestions).padStart(2, "0")}
          </p>
          <h1 className="font-numeral mt-2 text-[clamp(4rem,8vw,9.5rem)] leading-[0.82] text-kapas uppercase">
            {t("host.leaderboard")}
          </h1>
        </div>
        <p className="max-w-[22ch] text-right text-[clamp(1.4rem,2.2vw,2.75rem)] leading-tight font-extrabold text-balance text-sun">
          {remaining <= 0
            ? t("host.gameOver")
            : remaining === 1
              ? t("host.betweenRoundLast")
              : t("host.betweenRound2", { count: remaining })}
        </p>
      </header>

      <LayoutGroup>
        {/* Bottom padding keeps the last (right-most) row clear of the host control bar. */}
        <ol
          className="mt-[4vh] flex min-h-0 flex-1 flex-col justify-center gap-[1.4vh] pb-[clamp(56px,8vh,96px)]"
          aria-label={t("host.leaderboard")}
        >
          {rows.map((entry) => (
            // Parang cascade: each rank steps right, so the list reads as a diagonal run.
            <NusaLeaderboardRow
              key={entry.playerId}
              entry={entry}
              size="host"
              countFrom={settled ? entry.score - entry.lastPoints : undefined}
              className="w-[78%]"
              style={{ marginLeft: `${(entry.rank - 1) * 5.5}%` }}
            />
          ))}
        </ol>
      </LayoutGroup>
    </div>
  );
}
