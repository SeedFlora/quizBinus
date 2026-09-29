"use client";

import { NusaPattern } from "@/components/brand/NusaPattern";
import type { SessionAnalytics } from "@/lib/analytics/compute";
import { formatInteger, formatSeconds, toPercent } from "@/lib/analytics/format";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";

/**
 * The session's final scoreboard: the one navy moment on the analytics desk, so the
 * report still feels like the game it came from. Accuracy leads; the other three
 * figures explain it (who played, whether they answered, how long they took).
 */
export function Scoreboard({ analytics }: { analytics: SessionAnalytics }) {
  const { t, locale } = useI18n();
  const o = analytics.overview;
  const wrong = o.gradedResponses - o.correctResponses;
  const pct = (ratio: number | null) => (ratio === null ? null : toPercent(ratio));

  return (
    <section aria-labelledby="summary-title" className="nf nf-lg nf-solid relative overflow-hidden text-kapas">
      <NusaPattern kind="flow" intensity="quiet" fade="edges" className="nf-clip" />
      <h2 id="summary-title" className="sr-only">
        {t("analytics.summaryLabel")}
      </h2>
      <dl className="relative grid grid-cols-3 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))]">
        <div className="col-span-3 px-7 py-7 sm:px-9 lg:col-span-1 lg:py-9">
          <dt className="text-sm font-bold text-kapas/75">{t("analytics.overallAccuracy")}</dt>
          <dd>
            <Figure value={pct(o.overallAccuracy)} unit="%" hero />
            {o.overallAccuracy !== null && (
              <>
                <p className="mt-4 text-sm font-semibold text-kapas/80">
                  {t("analytics.accuracyDetail", {
                    correct: formatInteger(o.correctResponses, locale),
                    answered: formatInteger(o.gradedResponses, locale),
                  })}
                </p>
                <SplitBar correct={o.correctResponses} wrong={wrong} />
                <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs font-bold text-kapas/75">
                  <li className="flex items-center gap-2">
                    <span aria-hidden="true" className="size-2.5 -skew-x-12 bg-sun" />
                    {t("analytics.legendCorrect")} · {formatInteger(o.correctResponses, locale)}
                  </li>
                  <li className="flex items-center gap-2">
                    <span aria-hidden="true" className="size-2.5 -skew-x-12 bg-miss" />
                    {t("analytics.legendWrong")} · {formatInteger(wrong, locale)}
                  </li>
                </ul>
              </>
            )}
          </dd>
        </div>

        <Stat
          index={0}
          label={t("analytics.participants")}
          value={o.participants}
          detail={t("analytics.participantsDetail", { count: formatInteger(o.fullyCompleted, locale) })}
        />
        <Stat
          index={1}
          label={t("analytics.completion")}
          value={pct(o.completionRate)}
          unit="%"
          detail={t("analytics.completionDetail", {
            responses: formatInteger(o.responses, locale),
            expected: formatInteger(o.expectedResponses, locale),
          })}
        />
        <Stat
          index={2}
          label={t("analytics.avgResponse")}
          value={o.averageResponseMs === null ? null : formatSeconds(o.averageResponseMs, locale)}
          unit={t("common.secondsShort")}
          detail={t("analytics.avgResponseDetail")}
        />
      </dl>
    </section>
  );
}

function Stat({
  index,
  label,
  value,
  unit,
  detail,
}: {
  index: number;
  label: string;
  value: string | number | null;
  unit?: string;
  detail: string;
}) {
  return (
    <div
      className={cn(
        // Below lg the three stats share a row under the hero; at lg they sit beside it.
        "flex flex-col border-t border-kapas/12 px-5 py-6 sm:px-7 lg:border-t-0 lg:border-l lg:py-9",
        index > 0 && "border-l",
      )}
    >
      <dt className="text-sm font-bold text-kapas/75">{label}</dt>
      {/* Figures sit on the hero's bottom line, so the four read as one scoreboard row. */}
      <dd className="mt-auto pt-6">
        <Figure value={value} unit={unit} />
        <p className="mt-3 text-[13px] leading-snug font-semibold text-kapas/65">{detail}</p>
      </dd>
    </div>
  );
}

function Figure({ value, unit, hero }: { value: string | number | null; unit?: string; hero?: boolean }) {
  return (
    <p
      className={cn(
        "font-numeral mt-3 leading-[0.8]",
        hero ? "text-[clamp(5.5rem,10vw,9rem)] text-sun" : "text-[clamp(3.25rem,5vw,4.75rem)] text-kapas",
      )}
    >
      {value ?? "–"}
      {value !== null && unit && <span className="ml-1 text-[0.42em] text-kapas/60">{unit}</span>}
    </p>
  );
}

/** Correct vs not-quite over the answers given, cut with the parang slash. Decorative: the legend carries the counts. */
function SplitBar({ correct, wrong }: { correct: number; wrong: number }) {
  const total = correct + wrong;
  const share = total ? correct / total : 0;
  return (
    <span
      aria-hidden="true"
      className="relative mt-4 block h-2.5 max-w-[420px] overflow-hidden rounded-[2px] bg-miss/50"
    >
      <span
        className="parang-slash absolute inset-y-0 left-0 bg-sun text-[20px]"
        style={{ width: `${share * 100}%` }}
      />
    </span>
  );
}
