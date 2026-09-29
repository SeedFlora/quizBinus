"use client";

import { DifficultyMeter } from "@/components/creator/DifficultyMeter";
import { RatioBar } from "@/components/creator/RatioBar";
import { NusaBadge } from "@/components/ui/NusaBadge";
import type { GroupPerformance, SessionAnalytics } from "@/lib/analytics/compute";
import { formatNumberList, toPercent } from "@/lib/analytics/format";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";

const weakestFirst = (a: GroupPerformance, b: GroupPerformance) =>
  (a.accuracy ?? 1) - (b.accuracy ?? 1) || a.questionNumbers[0]! - b.questionNumbers[0]!;

/**
 * Learning-outcome performance, weakest first: each outcome's figure on the left,
 * the topics behind it on the right. When a quiz names no outcomes the groups ARE
 * the topics, so the panel lists the topics once instead of repeating them.
 */
export function OutcomePerformance({ analytics }: { analytics: SessionAnalytics }) {
  const t = useT();
  const topicsByKey = new Map(analytics.topics.map((g) => [g.key, g] as const));
  const outcomes = [...analytics.learningOutcomes].sort(weakestFirst);
  const onlyTopics = outcomes.every((o) => o.code === null && topicsByKey.has(o.key) && o.topicKeys.length <= 1);

  return (
    <section aria-labelledby="lo-title" className="nf nf-lg nf-desk p-6 sm:p-8">
      <h2 id="lo-title" className="font-display-tight text-2xl text-desk-text">
        {t("analytics.loPerformance")}
      </h2>
      <p className="mt-1.5 text-sm text-desk-muted">{t("analytics.loSub")}</p>

      {onlyTopics ? (
        <TopicList topics={[...analytics.topics].sort(weakestFirst)} className="mt-6 md:grid-cols-2 xl:grid-cols-3" />
      ) : (
        <div className="mt-6">
          {outcomes.map((lo, i) => {
            const topics = lo.topicKeys
              .map((key) => topicsByKey.get(key))
              .filter((g): g is GroupPerformance => Boolean(g))
              .sort(weakestFirst);
            return (
              <article
                key={lo.key}
                aria-label={lo.label ?? t("analytics.generalTopic")}
                className={cn(
                  "grid gap-x-12 gap-y-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]",
                  i > 0 && "mt-8 border-t border-desk-line pt-8",
                )}
              >
                <div>
                  <div className="flex items-start gap-3">
                    {lo.code && (
                      <NusaBadge tone="desk-primary" size="md" className="mt-0.5 shrink-0">
                        {lo.code}
                      </NusaBadge>
                    )}
                    <p className="leading-snug font-bold text-pretty text-desk-text">
                      {lo.description ?? t("analytics.generalTopic")}
                    </p>
                  </div>
                  <div className="mt-5 flex flex-wrap items-end gap-x-5 gap-y-2">
                    <p className="font-numeral text-[4.25rem] leading-[0.8] text-desk-text">
                      {lo.accuracy === null ? "–" : toPercent(lo.accuracy)}
                      {lo.accuracy !== null && <span className="ml-0.5 text-[0.42em] text-desk-muted">%</span>}
                    </p>
                    <div className="grid gap-1 pb-0.5">
                      {lo.difficulty && <DifficultyMeter difficulty={lo.difficulty} />}
                      <span className="text-sm text-desk-muted">
                        {t("analytics.questionsList", { list: formatNumberList(lo.questionNumbers) })}
                      </span>
                    </div>
                  </div>
                  {lo.accuracy !== null && <RatioBar value={lo.accuracy} tone="ink" className="mt-5 max-w-[22rem]" />}
                </div>
                {topics.length > 1 && <TopicList topics={topics} className="md:grid-cols-2" />}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TopicList({ topics, className }: { topics: GroupPerformance[]; className?: string }) {
  const t = useT();
  return (
    <ul className={cn("grid content-start gap-x-10", className)}>
      {topics.map((g) => (
        <li
          key={g.key}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-4 gap-y-2 border-b border-desk-line py-3"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-desk-text">
              {g.label ?? t("analytics.generalTopic")}
            </span>
            <span className="text-xs text-desk-muted">
              {t("analytics.questionsList", { list: formatNumberList(g.questionNumbers) })}
            </span>
          </span>
          <span className="font-numeral text-2xl leading-none text-desk-text">
            {g.accuracy === null ? "–" : toPercent(g.accuracy)}
            {g.accuracy !== null && <span className="text-[0.55em] text-desk-muted">%</span>}
          </span>
          {g.accuracy !== null && <RatioBar value={g.accuracy} className="col-span-2" />}
        </li>
      ))}
    </ul>
  );
}
