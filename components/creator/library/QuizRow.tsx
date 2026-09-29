"use client";

import Link from "next/link";
import { forwardRef } from "react";
import { BarChart3, Copy, Pencil, Play, Trash2 } from "lucide-react";
import { NusaButton } from "@/components/ui/NusaButton";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";
import { CourseCode } from "../CourseCode";
import { DifficultyMeter } from "../DifficultyMeter";
import { IconAction } from "../IconAction";
import { analyticsPath, editPath, type QuizListItem } from "../data";
import { formatShortDate } from "../format";
import { startErrorKey, type StartErrorCode } from "../start-session";

/** Column template shared by the header row and every quiz row, from 85rem = 1360px (rail + table fit; rem so it sorts after sm/lg). */
// Fixed action column so the header row (which has no buttons) lines up with the rows.
export const LIBRARY_COLUMNS = "min-[85rem]:grid-cols-[88px_minmax(0,1fr)_84px_104px_76px_348px]";

/**
 * One arena in the library. Wide screens read it as a table row; narrower ones
 * fold the meta and actions onto a second line under the title.
 */
export const QuizRow = forwardRef<
  HTMLLIElement,
  {
    quiz: QuizListItem;
    highlighted: boolean;
    starting: boolean;
    /** Why the last "Mulai sesi" of this arena failed, if it did. */
    startError: StartErrorCode | null;
    busy: boolean;
    onStart: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
  }
>(function QuizRow({ quiz, highlighted, starting, startError, busy, onStart, onDuplicate, onDelete }, ref) {
  const { t, locale } = useI18n();
  const actionFor = (action: string) => t("creator.library.actionFor", { action, title: quiz.title });
  const subline = [quiz.courseName, quiz.className, quiz.topic].filter(Boolean).join(" · ");

  return (
    <li
      ref={ref}
      className={cn(
        "relative border-b border-desk-line transition-colors duration-700 last:border-b-0",
        highlighted && "bg-binus-500/[0.06]",
      )}
    >
      {highlighted && <span aria-hidden="true" className="absolute inset-y-3 left-0 w-1 rounded-r-sm bg-binus-500" />}
      <div
        className={cn(
          "grid grid-cols-[72px_minmax(0,1fr)] items-center gap-x-5 gap-y-3 px-5 py-5 sm:grid-cols-[88px_minmax(0,1fr)] sm:px-7",
          LIBRARY_COLUMNS,
        )}
      >
        <CourseCode code={quiz.courseCode} />

        <div className="min-w-0">
          <Link
            href={editPath(quiz.id)}
            className="line-clamp-2 text-[17px] leading-snug font-bold text-pretty text-desk-text underline-offset-4 transition-colors hover:text-binus-500 hover:underline"
          >
            {quiz.title}
          </Link>
          {subline && <p className="mt-0.5 truncate text-sm text-desk-muted">{subline}</p>}
        </div>

        {/* Meta: its own columns on wide screens, one wrapped line below the title otherwise. */}
        <div className="col-start-2 flex flex-wrap items-center gap-x-5 gap-y-2 min-[85rem]:contents">
          <p className="text-sm whitespace-nowrap text-desk-text">
            <span className="font-numeral text-2xl leading-none">{quiz.questionCount}</span>{" "}
            {/* The table header already says "Soal"; keep the unit for screen readers there. */}
            <span className="text-desk-muted min-[85rem]:sr-only">{t("common.questions")}</span>
          </p>
          <DifficultyMeter difficulty={quiz.difficulty} />
          <p className="text-sm text-desk-muted">
            <span className="min-[85rem]:sr-only">{t("creator.library.columns.updated")} </span>
            {formatShortDate(quiz.updatedAt, locale)}
          </p>
        </div>

        <div className="col-span-2 flex flex-wrap items-center gap-1 sm:col-span-1 sm:col-start-2 min-[85rem]:col-start-auto min-[85rem]:justify-end">
          <NusaButton
            variant="desk-quiet"
            size="sm"
            icon={<Play size={15} aria-hidden="true" fill="currentColor" />}
            loading={starting}
            loadingLabel={t("creator.starting")}
            disabled={busy}
            aria-label={actionFor(t("creator.startSession"))}
            onClick={onStart}
            className="mr-2"
          >
            {t("creator.startSession")}
          </NusaButton>
          <IconAction
            href={editPath(quiz.id)}
            label={actionFor(t("creator.library.edit"))}
            tooltip={t("creator.library.edit")}
            icon={<Pencil size={18} aria-hidden="true" />}
          />
          <IconAction
            href={analyticsPath(quiz.id)}
            label={actionFor(t("creator.library.analytics"))}
            tooltip={t("creator.library.analytics")}
            icon={<BarChart3 size={18} aria-hidden="true" />}
          />
          <IconAction
            onClick={onDuplicate}
            disabled={busy}
            label={actionFor(t("creator.library.duplicate"))}
            tooltip={t("creator.library.duplicate")}
            icon={<Copy size={18} aria-hidden="true" />}
          />
          <IconAction
            onClick={onDelete}
            disabled={busy}
            tone="danger"
            label={actionFor(t("creator.library.delete"))}
            tooltip={t("creator.library.delete")}
            icon={<Trash2 size={18} aria-hidden="true" />}
          />
          {startError && (
            <p role="alert" className="w-full pt-1 text-[13px] font-semibold text-danger">
              {t(startErrorKey(startError))}
            </p>
          )}
        </div>
      </div>
    </li>
  );
});
