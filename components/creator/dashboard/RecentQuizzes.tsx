"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { CourseCode } from "../CourseCode";
import { DifficultyMeter } from "../DifficultyMeter";
import { editPath, type QuizListItem } from "../data";
import { formatShortDate } from "../format";

/** Recently edited arenas as editorial rows: course code anchor, title, count. */
export function RecentQuizzes({ items }: { items: QuizListItem[] | null }) {
  const { t, locale } = useI18n();
  return (
    <section aria-labelledby="recent-quizzes-title">
      <div className="flex items-end justify-between gap-4 border-b border-desk-line pb-3">
        <h2 id="recent-quizzes-title" className="font-display-tight text-2xl text-desk-text">
          {t("creator.recentQuiz")}
        </h2>
        <Link
          href="/quizzes"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-binus-500 underline-offset-4 hover:underline"
        >
          {t("creator.viewAll")}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>

      {items === null ? (
        <p className="py-8 text-sm text-desk-muted">{t("creator.library.loading")}</p>
      ) : items.length === 0 ? (
        <p className="py-8 text-sm text-desk-muted">{t("creator.emptyQuizzes")}</p>
      ) : (
        <ul>
          {items.map((q) => (
            <li key={q.id} className="border-b border-desk-line">
              <Link
                href={editPath(q.id)}
                className="group -mx-3 grid grid-cols-[76px_minmax(0,1fr)] items-center gap-x-5 gap-y-2 rounded-[8px_2px_14px_2px] px-3 py-4 transition-colors hover:bg-desk-surface sm:grid-cols-[88px_minmax(0,1fr)_auto]"
              >
                <CourseCode code={q.courseCode} />
                <span className="min-w-0">
                  <span className="block truncate text-[17px] font-bold text-desk-text transition-colors group-hover:text-binus-500">
                    {q.title}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-desk-muted">
                    {[q.courseName, q.className, t("creator.updated", { date: formatShortDate(q.updatedAt, locale) })]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="col-start-2 flex items-center gap-4 sm:col-start-auto sm:flex-col sm:items-end sm:gap-1.5">
                  <span className="text-sm text-desk-text">
                    <span className="font-numeral text-2xl leading-none">{q.questionCount}</span>{" "}
                    <span className="text-desk-muted">{t("common.questions")}</span>
                  </span>
                  <DifficultyMeter difficulty={q.difficulty} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
