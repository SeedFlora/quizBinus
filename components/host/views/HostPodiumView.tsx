"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { BarChart3, LayoutDashboard } from "lucide-react";
import { NusaPodium } from "@/components/game/NusaPodium";
import { KawungConfetti } from "@/components/game/KawungConfetti";
import type { SessionSnapshot } from "@/lib/game/types";
import { useT } from "@/lib/i18n/client";
import { getAudio } from "@/lib/audio/engine";

export function HostPodiumView({ snapshot, analyticsHref }: { snapshot: SessionSnapshot; analyticsHref: string }) {
  const t = useT();
  const [celebrate, setCelebrate] = useState(false);
  const winner = snapshot.leaderboard.find((e) => e.rank === 1);

  return (
    <div className="relative flex h-full flex-col">
      {celebrate && <KawungConfetti />}
      <header className="relative flex items-start justify-between gap-6">
        <div>
          <p className="hud-label text-[clamp(14px,1.2vw,22px)] text-stage-muted">
            {snapshot.courseCode} · {snapshot.quizTitle}
          </p>
          <h1 className="font-numeral mt-2 text-[clamp(4rem,8vw,9.5rem)] leading-[0.82] text-kapas uppercase">
            {t("host.gameOver")}
          </h1>
          {winner && celebrate && (
            <motion.p
              className="mt-3 text-[clamp(1.5rem,2.4vw,3rem)] font-extrabold text-sun"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {t("podium.congrats", { name: winner.nickname })}
            </motion.p>
          )}
        </div>
        <nav className="flex shrink-0 gap-3 whitespace-nowrap" aria-label={t("host.controls")}>
          <Link href={analyticsHref} className="nf nf-md nq-btn" data-variant="ghost" data-size="md">
            <span className="nq-btn__label">
              <BarChart3 size={18} aria-hidden="true" />
              {t("podium.viewAnalytics")}
            </span>
          </Link>
          <Link href="/dashboard" className="nf nf-md nq-btn" data-variant="ghost" data-size="md">
            <span className="nq-btn__label">
              <LayoutDashboard size={18} aria-hidden="true" />
              {t("podium.backToDashboard")}
            </span>
          </Link>
        </nav>
      </header>
      <div className="relative min-h-0 flex-1 pt-[4vh]">
        <NusaPodium
          entries={snapshot.leaderboard}
          onRevealed={(rank) => {
            if (rank !== 1) return;
            setCelebrate(true);
            void getAudio().play("winner");
          }}
        />
      </div>
    </div>
  );
}
