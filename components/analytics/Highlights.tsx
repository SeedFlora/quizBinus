"use client";

import type { ReactNode } from "react";
import { CheckCheck, Hourglass, Mountain, Split } from "lucide-react";
import type { QuestionAnalytics, SessionAnalytics } from "@/lib/analytics/compute";
import { formatSeconds, toPercent } from "@/lib/analytics/format";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";
import { AnswerChip } from "./AnswerChip";
import { questionLabel } from "./labels";

/**
 * Four findings written as sentences a lecturer can take into the next class,
 * each with the figure that proves it and a jump to the question itself.
 */
export function Highlights({
  analytics,
  onOpenQuestion,
}: {
  analytics: SessionAnalytics;
  onOpenQuestion: (questionId: string) => void;
}) {
  const { t, locale } = useI18n();
  const h = analytics.highlights;
  const byId = new Map(analytics.questions.map((q) => [q.id, q] as const));
  const label = (q: { number: number; topic: string | null }) => questionLabel(t, q.number, q.topic);

  const items: Array<{ key: string; question: QuestionAnalytics; node: ReactNode }> = [];

  if (h.hardest) {
    const q = byId.get(h.hardest.questionId)!;
    items.push({
      key: "hardest",
      question: q,
      node: (
        <Finding
          icon={<Mountain size={18} aria-hidden="true" />}
          title={t("analytics.hardest")}
          figure={`${toPercent(h.hardest.value)}`}
          unit="%"
          sentence={t("analytics.hardestSentence", { question: label(h.hardest), percent: toPercent(h.hardest.value) })}
          tip={t("analytics.hardestTip")}
        />
      ),
    });
  }
  if (h.misconception) {
    const q = byId.get(h.misconception.questionId)!;
    const bucket = h.misconception.bucket;
    items.push({
      key: "misconception",
      question: q,
      node: (
        <Finding
          icon={<Split size={18} aria-hidden="true" />}
          title={t("analytics.misconception")}
          figure={`${toPercent(h.misconception.value)}`}
          unit="%"
          chip={
            bucket.slot !== null ? <AnswerChip slot={bucket.slot} size={34} className="text-[1.1rem]" /> : undefined
          }
          sentence={t("analytics.misconceptionSentence", {
            percent: toPercent(h.misconception.value),
            answer: bucket.label,
            question: label(h.misconception),
          })}
          tip={t("analytics.misconceptionTip")}
        />
      ),
    });
  }
  if (h.slowest) {
    const q = byId.get(h.slowest.questionId)!;
    items.push({
      key: "slowest",
      question: q,
      node: (
        <Finding
          icon={<Hourglass size={18} aria-hidden="true" />}
          title={t("analytics.slowest")}
          figure={formatSeconds(h.slowest.value, locale)}
          unit={t("common.secondsShort")}
          sentence={t("analytics.slowestSentence", {
            question: label(h.slowest),
            seconds: formatSeconds(h.slowest.value, locale),
            limit: q.timeLimitMs / 1000,
          })}
          tip={t("analytics.slowestTip")}
        />
      ),
    });
  }
  if (h.easiest) {
    const q = byId.get(h.easiest.questionId)!;
    items.push({
      key: "easiest",
      question: q,
      node: (
        <Finding
          icon={<CheckCheck size={18} aria-hidden="true" />}
          title={t("analytics.easiest")}
          figure={`${toPercent(h.easiest.value)}`}
          unit="%"
          sentence={t("analytics.easiestSentence", { question: label(h.easiest), percent: toPercent(h.easiest.value) })}
          tip={t("analytics.easiestTip")}
        />
      ),
    });
  }

  return (
    <section aria-labelledby="highlights-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="highlights-title" className="font-display-tight text-2xl text-desk-text">
          {t("analytics.highlightsTitle")}
        </h2>
        <p className="text-sm text-desk-muted">{t("analytics.highlightsSub")}</p>
      </div>
      {items.length === 0 ? (
        <p className="mt-5 text-desk-muted">{t("analytics.noHighlights")}</p>
      ) : (
        <ul className="mt-5 grid border-y border-desk-line md:grid-cols-2 xl:grid-cols-4">
          {items.map(({ key, question, node }, i) => (
            <li key={key} className={cn("flex flex-col border-desk-line py-6 md:pr-6", RULES[i])}>
              {node}
              <button
                type="button"
                onClick={() => onOpenQuestion(question.id)}
                className="mt-auto inline-flex min-h-11 items-center gap-1.5 self-start pt-3 text-sm font-bold text-binus-500 underline-offset-4 hover:text-binus-700 hover:underline"
              >
                {t("analytics.viewQuestion", { n: question.number })}
                <span aria-hidden="true">→</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Hairline rules between findings: stacked (1 col), 2×2 at md, one row at xl. */
const RULES = [
  "",
  "border-t md:border-t-0 md:border-l md:pl-6 xl:pl-7",
  "border-t md:pl-0 xl:border-t-0 xl:border-l xl:pl-7",
  "border-t md:border-l md:pl-6 xl:border-t-0 xl:pl-7",
];

function Finding({
  icon,
  title,
  figure,
  unit,
  chip,
  sentence,
  tip,
}: {
  icon: ReactNode;
  title: string;
  figure: string;
  unit: string;
  chip?: ReactNode;
  sentence: string;
  tip: string;
}) {
  return (
    <>
      <h3 className="flex items-center gap-2 text-sm font-bold text-desk-muted">
        {icon}
        {title}
      </h3>
      <div className="mt-3 flex items-end gap-3" aria-hidden="true">
        <p className="font-numeral text-[3.5rem] leading-[0.8] text-desk-text">
          {figure}
          <span className="ml-0.5 text-[0.42em] text-desk-muted">{unit}</span>
        </p>
        {chip}
      </div>
      <p className="mt-4 text-[17px] leading-snug font-bold text-pretty text-desk-text">{sentence}</p>
      <p className="mt-1.5 mb-2 text-sm leading-snug text-desk-muted">{tip}</p>
    </>
  );
}
