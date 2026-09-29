"use client";

import Link from "next/link";
import { Play, Plus } from "lucide-react";
import { NusaPattern } from "@/components/brand/NusaPattern";
import { NusaButton, NusaLink } from "@/components/ui/NusaButton";
import { useI18n } from "@/lib/i18n/client";
import type { QuizListItem } from "../data";
import { editPath } from "../data";
import { formatSlotTime, formatWeekday } from "../format";
import type { UpcomingClass } from "../schedule";
import { startErrorKey, type StartErrorCode } from "../start-session";

/**
 * The bridge from desk to stage: the one navy surface on the dashboard, holding
 * the next class and the single orange action that opens its lobby.
 */
export function NextClassBand({
  upcoming,
  quiz,
  pending,
  startError,
  onStart,
}: {
  upcoming: UpcomingClass;
  quiz: QuizListItem | undefined;
  pending: boolean;
  /** Why the last start of this class's arena failed, if it did. */
  startError: StartErrorCode | null;
  onStart: (quizId: string) => void;
}) {
  const { t, locale } = useI18n();
  const { slot, inDays, startsAt } = upcoming;
  const when =
    inDays === 0
      ? t("creator.dashboard.today")
      : inDays === 1
        ? t("creator.dashboard.tomorrow")
        : formatWeekday(startsAt, locale);

  return (
    <section
      aria-labelledby="next-class-title"
      className="nf nf-lg nf-solid relative isolate overflow-hidden text-kapas"
    >
      <NusaPattern kind="kawung" intensity="soft" fade="edges" className="nf-clip" />
      <div className="relative grid gap-x-10 gap-y-6 px-6 py-7 sm:px-9 md:grid-cols-[auto_minmax(0,1fr)] xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:items-end">
        <div>
          <h2 id="next-class-title" className="text-sm font-bold text-kapas/70">
            {t("creator.dashboard.nextClass")} · {when}
          </h2>
          <p className="font-numeral mt-3 text-[clamp(4rem,7vw,5.75rem)] leading-[0.8]">
            {formatSlotTime(slot.start, locale)}
          </p>
          <p className="mt-2.5 text-sm font-semibold text-kapas/60">
            {t("creator.dashboard.until", { time: formatSlotTime(slot.end, locale) })}
          </p>
        </div>

        <div className="min-w-0 md:self-end">
          <p className="text-sm font-semibold text-kapas/70">
            {slot.courseCode} · {slot.className} · {t("creator.dashboard.room", { room: slot.room })}
          </p>
          <p className="font-display-tight mt-1 text-[1.75rem] leading-tight">{slot.courseName}</p>
          <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-kapas/80">
            {quiz ? (
              <>
                <span className="text-kapas/60">{t("creator.dashboard.arenaReady")}: </span>
                <span className="font-bold text-kapas">{quiz.title}</span>
                <span className="text-kapas/60"> · {t("creator.questionsCount", { count: quiz.questionCount })}</span>
              </>
            ) : (
              t("creator.dashboard.noArena")
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 md:col-span-2 xl:col-span-1 xl:justify-end">
          {quiz ? (
            <>
              <Link
                href={editPath(quiz.id)}
                className="inline-flex min-h-11 items-center text-sm font-bold text-kapas/75 underline-offset-4 hover:text-kapas hover:underline"
              >
                {t("creator.dashboard.editArena")}
              </Link>
              <NusaButton
                variant="energy"
                size="lg"
                icon={<Play size={18} aria-hidden="true" fill="currentColor" />}
                loading={pending}
                loadingLabel={t("creator.starting")}
                onClick={() => onStart(quiz.id)}
              >
                {t("creator.startSession")}
              </NusaButton>
            </>
          ) : (
            <NusaLink href="/quizzes/new" variant="energy" size="lg" icon={<Plus size={18} aria-hidden="true" />}>
              {t("creator.dashboard.prepareArena")}
            </NusaLink>
          )}
          {startError && (
            <p role="alert" className="w-full text-sm font-semibold text-sun xl:text-right">
              {t(startErrorKey(startError))}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
