"use client";

import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";
import type { TeachingPulse as Pulse } from "../data";
import { percent } from "../format";
import { RatioBar } from "../RatioBar";

/**
 * Two numbers a lecturer actually cares about, set as architecture rather than
 * in cards: are students taking part, and are they getting it right.
 */
export function TeachingPulse({ pulse }: { pulse: Pulse }) {
  const t = useT();
  const ratios = [
    {
      key: "engagement",
      label: t("creator.engagement"),
      value: pulse.engagement,
      hint: t("creator.dashboard.engagementHint"),
    },
    {
      key: "accuracy",
      label: t("creator.avgAccuracy"),
      value: pulse.accuracy,
      hint: t("creator.dashboard.accuracyHint", { count: pulse.sessionsMeasured }),
    },
  ];

  return (
    <section
      aria-label={`${t("creator.engagement")}, ${t("creator.avgAccuracy")}`}
      className="grid border-b border-desk-line sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)]"
    >
      {ratios.map((r, i) => (
        <div
          key={r.key}
          className={cn("py-7 sm:pr-8", i > 0 && "border-t border-desk-line sm:border-t-0 sm:border-l sm:pl-8")}
        >
          <p className="text-sm font-bold text-desk-text">{r.label}</p>
          {r.value === null ? (
            <p className="mt-4 text-sm text-desk-muted">{t("creator.dashboard.noData")}</p>
          ) : (
            <>
              <p className="font-numeral mt-3 text-[clamp(4.25rem,7.5vw,6.5rem)] leading-[0.8] text-desk-text">
                {percent(r.value)}
                <span className="ml-1 text-[0.45em] text-desk-muted">%</span>
              </p>
              <RatioBar value={r.value} className="mt-5 max-w-[240px]" />
              <p className="mt-2.5 text-[13px] text-desk-muted">{r.hint}</p>
            </>
          )}
        </div>
      ))}

      <dl className="grid grid-cols-2 gap-6 border-t border-desk-line py-7 sm:col-span-2 lg:col-span-1 lg:grid-cols-1 lg:content-center lg:gap-5 lg:border-t-0 lg:border-l lg:pl-8">
        {/* dt first for valid markup; column-reverse puts the numeral on top. */}
        <div className="flex flex-col-reverse">
          <dt className="mt-1 text-sm text-desk-muted">{t("creator.sessionsThisWeek")}</dt>
          <dd className="font-numeral text-[2.75rem] leading-[0.85] text-desk-text">{pulse.sessionsThisWeek}</dd>
        </div>
        <div className="flex flex-col-reverse">
          <dt className="mt-1 text-sm text-desk-muted">{t("creator.studentsReached")}</dt>
          <dd className="font-numeral text-[2.75rem] leading-[0.85] text-desk-text">{pulse.students}</dd>
        </div>
      </dl>
    </section>
  );
}
