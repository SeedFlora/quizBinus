"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Share2 } from "lucide-react";
import { AchievementIcon } from "@/components/game/AchievementIcon";
import { NusaAvatar } from "@/components/game/NusaAvatar";
import { NusaScore } from "@/components/game/NusaScore";
import { NusaButton } from "@/components/ui/NusaButton";
import { NusaPattern } from "@/components/brand/NusaPattern";
import { ACHIEVEMENTS, type PlayerSummary } from "@/lib/game/types";
import type { TranslationKey } from "@/lib/i18n/config";
import { useT } from "@/lib/i18n/client";
import { brand } from "@/lib/brand";

/** Personal summary: the one screen students screenshot, so it is designed as a card. */
export function PlayerFinalView({ summary, quizTitle }: { summary: PlayerSummary; quizTitle: string }) {
  const t = useT();
  const reduce = useReducedMotion();
  const podium = summary.rank <= 3;

  const share = async () => {
    const text = `${brand.name}: #${summary.rank} dari ${summary.totalPlayers} di "${quizTitle}" dengan ${summary.score.toLocaleString("id-ID")} poin!`;
    try {
      if (navigator.share) await navigator.share({ title: brand.name, text });
      else await navigator.clipboard.writeText(text);
    } catch {
      /* user cancelled */
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <p className="hud-label text-center text-stage-muted">{t("final.title")}</p>

      <motion.section
        aria-label={t("final.yourRank")}
        className={`nf nf-xl relative mt-5 overflow-hidden px-6 pt-6 pb-7 ${podium ? "nf-sun" : "nf-panel"}`}
        initial={reduce ? { opacity: 0 } : { y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 22 }}
      >
        <NusaPattern kind="kawung" intensity="soft" className="nf-clip" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className={`hud-label ${podium ? "text-binus-950/60" : "text-stage-muted"}`}>{t("final.yourRank")}</p>
            <p className={`font-numeral mt-1 text-[7.5rem] leading-[0.8] ${podium ? "text-binus-950" : "text-kapas"}`}>
              #{String(summary.rank).padStart(2, "0")}
            </p>
            <p className={`mt-1 text-sm font-bold ${podium ? "text-binus-950/70" : "text-stage-muted"}`}>
              {t("common.of")} {summary.totalPlayers} {t("common.players")}
            </p>
          </div>
          {/* Seated on a navy tile: a yellow avatar must not dissolve into the yellow podium card. */}
          <span
            className={`nf nf-lg grid size-24 shrink-0 place-items-center ${podium ? "[--nf-fill:var(--binus-blue-950)]" : "nf-solid"}`}
          >
            <NusaAvatar seed={summary.avatarSeed} size={72} />
          </span>
        </div>
        <p className={`relative mt-5 truncate text-xl font-extrabold ${podium ? "text-binus-950" : "text-kapas"}`}>
          {summary.nickname}
        </p>
        <p className={`font-numeral relative text-5xl leading-none ${podium ? "text-binus-950" : "text-sun"}`}>
          <NusaScore value={summary.score} suffix=" PTS" delay={0.3} />
        </p>
      </motion.section>

      <dl className="mt-4 grid grid-cols-2 gap-2">
        <Tile label={t("final.accuracy")} value={`${Math.round(summary.accuracy * 100)}%`} />
        <Tile
          label={t("final.avgTime")}
          value={summary.averageResponseMs !== null ? `${(summary.averageResponseMs / 1000).toFixed(1)}s` : "–"}
        />
        <Tile label={t("final.bestStreak")} value={`×${summary.bestStreak}`} />
        <Tile label={t("final.strongestTopic")} value={summary.strongestTopic ?? "–"} small />
      </dl>

      {summary.accuracy === 1 && summary.answered > 0 && (
        <p className="mt-5 text-center text-lg font-extrabold text-sun">{t("final.perfect")}</p>
      )}

      <section className="mt-6" aria-labelledby="ach-title">
        <h2 id="ach-title" className="hud-label text-stage-muted">
          {t("final.achievements")}
        </h2>
        <ul className="mt-3 grid grid-cols-4 gap-3">
          {ACHIEVEMENTS.map((id, i) => {
            const earned = summary.achievements.includes(id);
            return (
              <motion.li
                key={id}
                className="flex flex-col items-center gap-1.5 text-center"
                initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.5 + i * 0.06, type: "spring", stiffness: 380, damping: 18 }}
              >
                <AchievementIcon id={id} earned={earned} size={52} />
                <span className={`text-[11px] leading-tight font-bold ${earned ? "text-kapas" : "text-stage-faint"}`}>
                  {t(`achievements.${id}` as TranslationKey)}
                </span>
                <span className="sr-only">{t(`achievements.${id}Desc` as TranslationKey)}</span>
              </motion.li>
            );
          })}
        </ul>
      </section>

      {/* Phone widths: share collapses to its glyph so neither label wraps; one row, primary on the right. */}
      <div className="mt-auto grid grid-cols-[auto_minmax(0,1fr)] gap-3 pt-8 min-[440px]:grid-cols-2">
        <NusaButton
          variant="ghost"
          size="lg"
          onClick={() => void share()}
          icon={<Share2 size={20} aria-hidden="true" />}
          title={t("final.share")}
        >
          <span className="sr-only min-[440px]:not-sr-only">{t("final.share")}</span>
        </NusaButton>
        <Link href="/join" className="nf nf-md nq-btn" data-variant="energy" data-size="lg">
          <span className="nq-btn__label">{t("final.playAgain")}</span>
        </Link>
      </div>
      <p className="mt-4 text-center text-sm text-stage-faint">{t("final.thanks")}</p>
    </div>
  );
}

function Tile({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="nf nf-md nf-solid px-4 py-3">
      <dt className="hud-label text-[10px] text-stage-muted">{label}</dt>
      <dd
        className={
          small
            ? "mt-2 truncate text-base font-extrabold text-kapas"
            : "font-numeral mt-1 text-4xl leading-none text-kapas"
        }
      >
        {value}
      </dd>
    </div>
  );
}
