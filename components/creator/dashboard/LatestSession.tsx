"use client";

import { ArrowRight, MonitorPlay } from "lucide-react";
import { NusaBadge } from "@/components/ui/NusaBadge";
import { NusaLink } from "@/components/ui/NusaButton";
import { useI18n } from "@/lib/i18n/client";
import { analyticsPath, hostPath, type SessionRecord } from "../data";
import { formatShortDate, formatTime, formatWeekday, percent } from "../format";
import { RatioBar } from "../RatioBar";
import { SessionStatusBadge } from "../SessionStatusBadge";

/**
 * The last class, told as a short story: who played, how well, and where the
 * class struggled. A running session takes its place so the lecturer can jump back in.
 */
export function LatestSession({ record }: { record: SessionRecord | undefined }) {
  const { t, locale } = useI18n();

  if (!record) {
    return (
      <section aria-labelledby="latest-session-title" className="nf nf-lg nf-desk p-7">
        <h2 id="latest-session-title" className="text-sm font-bold text-desk-muted">
          {t("creator.recentSession")}
        </h2>
        <p className="mt-4 text-sm text-desk-muted">{t("creator.emptySessions")}</p>
      </section>
    );
  }

  const running = record.status !== "ended";
  const when = `${formatWeekday(record.startedAt, locale)}, ${formatShortDate(record.startedAt, locale)} · ${formatTime(record.startedAt, locale)}`;

  return (
    <section aria-labelledby="latest-session-title" className="nf nf-lg nf-desk p-7 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="latest-session-title" className="text-sm font-bold text-desk-muted">
          {t("creator.recentSession")}
        </h2>
        <span className="flex items-center gap-2">
          {record.demo && (
            <NusaBadge tone="desk" size="sm">
              {t("sessions.demo")}
            </NusaBadge>
          )}
          <SessionStatusBadge status={record.status} />
        </span>
      </div>

      <p className="font-display-tight mt-4 text-[1.625rem] leading-tight text-balance text-desk-text">
        {record.quizTitle}
      </p>
      <p className="mt-1.5 text-sm text-desk-muted">
        {[record.courseCode, record.className].filter(Boolean).join(" · ")} · {when}
      </p>

      {/* Numbers and the hardest topic sit side by side while the card spans the page (md–xl). */}
      <div className="mt-7 grid gap-7 md:grid-cols-2 md:items-end xl:grid-cols-1">
        <dl className="grid grid-cols-2 gap-6">
          <div className="flex flex-col-reverse">
            <dt className="mt-2 text-sm text-desk-muted">{t("creator.dashboard.accuracy")}</dt>
            <dd className="font-numeral text-[3.75rem] leading-[0.8] text-desk-text">
              {record.accuracy === null ? "–" : percent(record.accuracy)}
              {record.accuracy !== null && <span className="ml-0.5 text-[0.45em] text-desk-muted">%</span>}
            </dd>
          </div>
          <div className="flex flex-col-reverse">
            <dt className="mt-2 text-sm text-desk-muted">{t("creator.dashboard.players")}</dt>
            <dd className="font-numeral text-[3.75rem] leading-[0.8] text-desk-text">{record.players}</dd>
          </div>
        </dl>

        {record.hardestTopic && (
          <div className="border-t border-desk-line pt-5 md:border-t-0 md:pt-0 xl:border-t xl:pt-5">
            <p className="text-sm font-bold text-desk-muted">{t("creator.hardestTopic")}</p>
            <p className="mt-1 font-bold text-desk-text">
              {t("creator.dashboard.hardestValue", {
                topic: record.hardestTopic.topic,
                percent: percent(record.hardestTopic.accuracy),
              })}
            </p>
            <RatioBar value={record.hardestTopic.accuracy} tone="ink" className="mt-3 max-w-[260px]" />
          </div>
        )}
      </div>

      <div className="mt-7">
        {running ? (
          <NusaLink
            href={hostPath(record)}
            variant="desk"
            size="sm"
            icon={<MonitorPlay size={16} aria-hidden="true" />}
          >
            {t("creator.dashboard.openHost")}
          </NusaLink>
        ) : (
          <NusaLink
            href={analyticsPath(record.quizId, record.id)}
            variant="desk-quiet"
            size="sm"
            trailing={<ArrowRight size={16} aria-hidden="true" />}
          >
            {t("creator.dashboard.openAnalytics")}
          </NusaLink>
        )}
      </div>
    </section>
  );
}
