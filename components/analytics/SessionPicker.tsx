"use client";

import { useId } from "react";
import { useRouter } from "next/navigation";
import { NusaBadge } from "@/components/ui/NusaBadge";
import { Select } from "@/components/ui/desk/Field";
import { analyticsPath } from "@/components/creator/data";
import { formatShortDate, formatTime, formatWeekday } from "@/components/creator/format";
import type { AnalyticsSessionOption } from "@/lib/analytics/sources";
import { useI18n } from "@/lib/i18n/client";

/**
 * Which class this report is about. Switching changes the URL (?session=…), so a
 * report can be bookmarked or shared with a co-lecturer.
 */
export function SessionPicker({
  quizId,
  sessions,
  current,
}: {
  quizId: string;
  sessions: AnalyticsSessionOption[];
  /** The session on screen; listed even when it is not one of this quiz's sessions. */
  current: AnalyticsSessionOption;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const id = useId();
  const options = sessions.some((s) => s.id === current.id) ? sessions : [current, ...sessions];

  const label = (s: AnalyticsSessionOption) => {
    if (s.startedAt === null) return t("analytics.sessionOptionDemo", { players: s.participants });
    const text = t("analytics.sessionOption", {
      date: `${formatWeekday(s.startedAt, locale)}, ${formatShortDate(s.startedAt, locale)}`,
      time: formatTime(s.startedAt, locale),
      players: s.participants,
    });
    const tags = [
      s.source === "demo" ? t("sessions.demo") : null,
      s.status === "in_progress" ? t("sessions.live") : null,
    ].filter(Boolean);
    return tags.length ? `${text} · ${tags.join(" · ")}` : text;
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <label htmlFor={id} className="text-sm font-bold text-desk-text">
        {t("analytics.sessionLabel")}
      </label>
      <div className="w-full max-w-[440px] min-w-[260px] flex-1 sm:flex-none">
        <Select
          id={id}
          value={current.id}
          onChange={(e) => router.push(analyticsPath(quizId, e.target.value), { scroll: false })}
        >
          {options.map((s) => (
            <option key={s.id} value={s.id}>
              {label(s)}
            </option>
          ))}
        </Select>
      </div>
      {current.source === "demo" && (
        <NusaBadge tone="desk" size="sm">
          {t("sessions.demo")}
        </NusaBadge>
      )}
      {current.status === "in_progress" && (
        <NusaBadge tone="energy" size="sm">
          {t("sessions.live")}
        </NusaBadge>
      )}
    </div>
  );
}
