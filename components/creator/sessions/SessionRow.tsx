"use client";

import Link from "next/link";
import { forwardRef } from "react";
import { ArrowRight, MonitorPlay } from "lucide-react";
import { NusaBadge } from "@/components/ui/NusaBadge";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";
import { analyticsPath, hostPath, type SessionRecord } from "../data";
import { dateParts, formatTime, percent } from "../format";
import { RatioBar } from "../RatioBar";
import { SessionStatusBadge } from "../SessionStatusBadge";

/**
 * One session. The whole row is a single link (one tab stop): finished sessions
 * open their analytics, running ones reopen the host screen.
 */
export const SessionRow = forwardRef<HTMLLIElement, { record: SessionRecord; focused: boolean }>(function SessionRow(
  { record, focused },
  ref,
) {
  const { t, locale } = useI18n();
  const running = record.status !== "ended";
  const href = running ? hostPath(record) : analyticsPath(record.quizId, record.id);
  const day = dateParts(record.startedAt, locale);
  const actionLabel =
    record.status === "lobby"
      ? t("sessions.openLobby")
      : record.status === "live"
        ? t("sessions.openHost")
        : t("sessions.viewAnalytics");
  const meta = [
    [record.courseCode, record.className].filter(Boolean).join(" · "),
    formatTime(record.startedAt, locale),
    // Older server sessions arrive as a summary without question counts.
    record.totalQuestions === 0
      ? null
      : record.status === "live"
        ? t("sessions.progress", { played: record.questionsPlayed, total: record.totalQuestions })
        : t("sessions.questions", { count: record.totalQuestions }),
    running ? t("sessions.pin", { code: record.roomCode }) : null,
  ].filter(Boolean);

  return (
    <li ref={ref} className="relative border-b border-desk-line last:border-b-0">
      {focused && <span aria-hidden="true" className="absolute inset-y-3 left-0 z-10 w-1 rounded-r-sm bg-binus-500" />}
      <Link
        href={href}
        aria-current={focused ? "true" : undefined}
        className={cn(
          "group grid grid-cols-[56px_minmax(0,1fr)] items-center gap-x-5 gap-y-4 px-5 py-5 transition-colors sm:px-7",
          "lg:grid-cols-[64px_minmax(0,1fr)_84px_150px_auto]",
          focused ? "bg-binus-500/[0.06]" : "hover:bg-desk-sunken/40",
        )}
      >
        {/* Calendar anchor: the day as a condensed numeral. */}
        <span className="flex flex-col items-start leading-none" aria-hidden="true">
          <span className="text-xs font-bold text-desk-muted">{day.month}</span>
          <span className="font-numeral text-[2.5rem] leading-[0.9] text-desk-text">{day.day}</span>
          <span className="text-xs font-semibold text-desk-faint">{day.weekday}</span>
        </span>

        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <SessionStatusBadge status={record.status} />
            {record.demo && (
              <NusaBadge tone="desk" size="sm">
                {t("sessions.demo")}
              </NusaBadge>
            )}
          </span>
          <span className="mt-2 block text-[17px] leading-snug font-bold text-pretty text-desk-text transition-colors group-hover:text-binus-500">
            {record.quizTitle}
          </span>
          <span className="mt-0.5 block text-sm text-desk-muted">{meta.join(" · ")}</span>
        </span>

        <span className="col-start-2 flex flex-wrap items-end gap-x-8 gap-y-3 lg:contents">
          <span className="block">
            <span className="font-numeral block text-[2rem] leading-[0.85] text-desk-text">{record.players}</span>
            <span className="mt-1 block text-[13px] text-desk-muted">{t("sessions.players")}</span>
          </span>

          <span className="block min-w-[120px]">
            {record.accuracy === null ? (
              record.status !== "lobby" && (
                <span className="block text-[13px] text-desk-muted">{t("sessions.noAccuracy")}</span>
              )
            ) : (
              <>
                <span className="font-numeral block text-[2rem] leading-[0.85] text-desk-text">
                  {percent(record.accuracy)}
                  <span className="text-[0.5em] text-desk-muted">%</span>
                </span>
                <span className="mt-1 block text-[13px] text-desk-muted">{t("sessions.accuracy")}</span>
                <RatioBar value={record.accuracy} className="mt-2 w-[120px]" />
              </>
            )}
          </span>

          <span
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-[8px_2px_12px_2px] px-3.5 text-sm font-bold whitespace-nowrap transition-colors lg:justify-self-end",
              running ? "bg-binus-500 text-white" : "text-binus-500 group-hover:bg-binus-500/10",
            )}
          >
            {running && <MonitorPlay size={16} aria-hidden="true" />}
            {actionLabel}
            {!running && (
              <ArrowRight size={16} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
            )}
          </span>
        </span>
      </Link>
    </li>
  );
});
