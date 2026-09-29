"use client";

import { describeScoring } from "@/lib/game/scoring";
import type { GameMode } from "@/lib/game/types";
import { useI18n } from "@/lib/i18n/client";

/**
 * Transparent scoring, drawn as the split it is: the guaranteed "correct" share and
 * the speed bonus that drains to zero, separated by a parang slash.
 */
export function ScoringExplainer({ mode, points, scored }: { mode: GameMode; points: number; scored: boolean }) {
  const { t, locale } = useI18n();
  if (!scored || points === 0) {
    return <p className="text-[13px] leading-relaxed text-desk-muted">{t("editor.scoringNone")}</p>;
  }
  const s = describeScoring(mode, points);
  const fmt = (n: number) => new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-GB").format(n);
  const baseShare = s.base / Math.max(1, s.base + s.speedMax);

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-[3px_1px_6px_1px]" aria-hidden="true">
        <span className="parang-slash h-full bg-binus-500" style={{ width: `calc(${baseShare * 100}% + 0.2em)` }} />
        <span className="-ml-[0.2em] h-full flex-1 bg-energy" />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-3">
        <div>
          <dt className="text-[12px] font-bold text-desk-muted">{t("editor.scoringBase")}</dt>
          <dd className="font-numeral text-2xl leading-none text-binus-500">{fmt(s.base)}</dd>
        </div>
        <div className="text-right">
          <dt className="text-[12px] font-bold text-desk-muted">{t("editor.scoringSpeed")}</dt>
          <dd className="font-numeral text-2xl leading-none text-energy-deep">0–{fmt(s.speedMax)}</dd>
        </div>
      </dl>
      <p className="mt-2.5 text-[12.5px] leading-relaxed text-desk-muted">
        {t("editor.scoringExplain", {
          base: fmt(s.base),
          speed: fmt(s.speedMax),
          step: s.streakStep,
          cap: s.streakCap,
        })}
      </p>
    </div>
  );
}
