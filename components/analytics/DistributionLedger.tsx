"use client";

import { Check, ChevronDown, Split } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { answerSlot } from "@/components/game/AnswerSymbol";
import { DifficultyMeter } from "@/components/creator/DifficultyMeter";
import { NusaBadge } from "@/components/ui/NusaBadge";
import type { QuestionAnalytics, ResponseBucket } from "@/lib/analytics/compute";
import { formatInteger, formatSeconds, pad2, toPercent } from "@/lib/analytics/format";
import { useI18n } from "@/lib/i18n/client";
import { transition } from "@/lib/motion";
import { cn } from "@/lib/cn";
import { AnswerChip } from "./AnswerChip";
import { questionAnchor } from "./labels";

/**
 * Every question as one ledger line: number, topic, prompt, a stacked "stage slice"
 * of how the room answered, and accuracy. Opening a line shows each option with
 * its symbol, letter and share, the correct answer and the main misconception
 * called out in words. Distribution bars sit on navy tracks, the same stage the
 * answers were chosen on, so the four answer colours keep their contrast.
 */
export function DistributionLedger({
  questions,
  open,
  onToggle,
}: {
  questions: QuestionAnalytics[];
  open: ReadonlySet<string>;
  onToggle: (questionId: string) => void;
}) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="distribution-title" className="nf nf-lg nf-desk px-6 pt-6 pb-2 sm:px-8 sm:pt-8">
      <h2 id="distribution-title" className="font-display-tight text-2xl text-desk-text">
        {t("analytics.distribution")}
      </h2>
      <p className="mt-1.5 max-w-[62ch] text-sm text-desk-muted">{t("analytics.distributionSub")}</p>
      <ol className="mt-6">
        {questions.map((q) => (
          <QuestionLine key={q.id} question={q} expanded={open.has(q.id)} onToggle={() => onToggle(q.id)} />
        ))}
      </ol>
    </section>
  );
}

function QuestionLine({
  question: q,
  expanded,
  onToggle,
}: {
  question: QuestionAnalytics;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t, locale } = useI18n();
  const reduce = useReducedMotion();
  const played = q.status === "played";
  const panelId = `${questionAnchor(q.id)}-panel`;
  const meta = [q.topic, t(`editor.types.${q.type}`)].filter(Boolean).join(" · ");

  return (
    <li id={questionAnchor(q.id)} className="scroll-mt-6 border-t border-desk-line">
      <h3>
        <button
          type="button"
          aria-expanded={played ? expanded : undefined}
          aria-controls={played ? panelId : undefined}
          disabled={!played}
          onClick={onToggle}
          className="group grid min-h-[76px] w-full grid-cols-[3.25rem_minmax(0,1fr)_4.25rem_1.25rem] items-center gap-x-4 py-4 text-left disabled:cursor-default md:grid-cols-[3.5rem_minmax(0,1fr)_minmax(140px,220px)_4.5rem_1.25rem] md:gap-x-5"
        >
          <span className="font-numeral text-[2.5rem] leading-[0.8] text-desk-text transition-colors group-enabled:group-hover:text-binus-500">
            {pad2(q.number)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-bold text-desk-muted">{meta}</span>
            <span className="mt-0.5 block truncate font-semibold text-desk-text">{q.prompt}</span>
          </span>
          <span className="hidden md:block">
            {played ? (
              <StackedSlice question={q} />
            ) : (
              <span className="text-sm text-desk-muted">{statusNote(q, t)}</span>
            )}
          </span>
          <span className="text-right">
            {q.accuracy !== null ? (
              <span className="font-numeral text-[2rem] leading-none text-desk-text">
                {toPercent(q.accuracy)}
                <span className="text-[0.5em] text-desk-muted">%</span>
              </span>
            ) : (
              <span className="text-sm font-bold text-desk-muted">
                {played ? (q.gradable ? t("analytics.noAnswer") : t("editor.types.poll")) : "–"}
              </span>
            )}
          </span>
          <ChevronDown
            size={20}
            aria-hidden="true"
            className={cn(
              "text-desk-muted transition-transform duration-200",
              expanded && "rotate-180",
              !played && "invisible",
            )}
          />
        </button>
      </h3>

      {played && expanded && (
        <motion.div
          id={panelId}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0.12 } : transition.system}
          className="pb-7 md:pl-[4.75rem]"
        >
          <p className="max-w-[75ch] text-[15px] leading-relaxed font-semibold text-pretty text-desk-text">
            {q.prompt}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-desk-muted">
            {q.difficulty && <DifficultyMeter difficulty={q.difficulty} />}
            <span>
              {t("analytics.answeredOf", {
                answered: formatInteger(q.answered, locale),
                eligible: formatInteger(q.eligible, locale),
              })}
            </span>
            {q.averageResponseMs !== null && (
              <span>
                {t("analytics.avgTimeOf", {
                  seconds: formatSeconds(q.averageResponseMs, locale),
                  limit: q.timeLimitMs / 1000,
                })}
              </span>
            )}
            {q.correctText && (
              <span className="font-semibold text-desk-text">
                {t("analytics.keyAnswer", { answer: q.correctText })}
              </span>
            )}
            {!q.gradable && <span>{t("analytics.pollNote")}</span>}
          </div>

          <ul className="mt-5 grid gap-2.5">
            {q.distribution.map((bucket) => (
              <OptionLine key={bucket.key} bucket={bucket} misconception={q.misconception?.key === bucket.key} />
            ))}
            {q.noAnswer > 0 && (
              <li className="grid grid-cols-[4.5rem_minmax(0,1fr)_4.5rem] items-center gap-4 sm:grid-cols-[4.5rem_minmax(0,1fr)_minmax(120px,240px)_4.5rem]">
                <span
                  aria-hidden="true"
                  className="ml-0.5 block size-[34px] rounded-[6px_2px_10px_2px] border border-dashed border-desk-faint"
                />
                <span className="text-[15px] font-semibold text-desk-muted">{t("analytics.noAnswer")}</span>
                <span aria-hidden="true" className="hidden sm:block" />
                <span className="text-right text-sm font-bold text-desk-muted">
                  {t("analytics.people", { count: q.noAnswer })}
                </span>
              </li>
            )}
          </ul>
        </motion.div>
      )}
    </li>
  );
}

function OptionLine({ bucket, misconception }: { bucket: ResponseBucket; misconception: boolean }) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const fill = fillOf(bucket);
  const text = bucket.isOther ? t("analytics.otherResponses") : bucket.label;

  return (
    <li className="grid grid-cols-[4.5rem_minmax(0,1fr)_4.5rem] items-center gap-4 sm:grid-cols-[4.5rem_minmax(0,1fr)_minmax(120px,240px)_4.5rem]">
      {bucket.slot !== null ? (
        <AnswerChip slot={bucket.slot} size={34} className="text-lg" />
      ) : (
        <span aria-hidden="true" className="nf nf-sm nf-solid ml-0.5 inline-grid size-[34px] place-items-center">
          <span className="block h-2.5 w-4 -skew-x-12" style={{ background: fill }} />
        </span>
      )}
      <span className="min-w-0">
        <span
          className={cn(
            "block text-[15px] leading-snug font-semibold break-words",
            bucket.isOther ? "text-desk-muted italic" : "text-desk-text",
          )}
        >
          {bucket.slot === null && !bucket.isOther ? `“${text}”` : text}
        </span>
        {(bucket.isCorrect || misconception) && (
          <span className="mt-1.5 flex flex-wrap gap-2">
            {bucket.isCorrect && (
              <NusaBadge tone="success" size="sm" icon={<Check size={13} strokeWidth={3} aria-hidden="true" />}>
                {t("analytics.correctAnswer")}
              </NusaBadge>
            )}
            {misconception && (
              <NusaBadge tone="energy" size="sm" icon={<Split size={13} strokeWidth={2.5} aria-hidden="true" />}>
                {t("analytics.mainMisconception")}
              </NusaBadge>
            )}
          </span>
        )}
      </span>
      <span aria-hidden="true" className="relative hidden h-4 overflow-hidden rounded-[2px] bg-binus-950 sm:block">
        <motion.span
          className="parang-slash absolute inset-y-[2px] left-[2px] origin-left text-[14px]"
          style={{ width: `calc(${bucket.share} * (100% - 4px))`, background: fill }}
          initial={reduce ? false : { scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={transition.game}
        />
      </span>
      <span className="text-right">
        <span className="font-numeral block text-2xl leading-none text-desk-text">
          {toPercent(bucket.share)}
          <span className="text-[0.55em] text-desk-muted">%</span>
        </span>
        <span className="text-xs font-semibold text-desk-muted">{t("analytics.people", { count: bucket.count })}</span>
      </span>
    </li>
  );
}

/**
 * The room's answers as one navy strip in the four answer colours, with a thin ink
 * rule under the correct share (the answer key), so correctness reads by position,
 * not hue. Decorative: the accuracy figure beside it is the value.
 */
function StackedSlice({ question: q }: { question: QuestionAnalytics }) {
  const total = q.distribution.reduce((sum, b) => sum + b.count, 0);
  const segments = total > 0 ? q.distribution.filter((b) => b.count > 0) : [];
  const width = (b: ResponseBucket) => `${(b.count / total) * 100}%`;
  return (
    <span aria-hidden="true" className="block">
      {/* A 2px navy frame keeps the kapas (C) share visible against the white desk. */}
      <span className="flex h-3.5 w-full overflow-hidden rounded-[2px] bg-binus-950 p-[2px]">
        {segments.map((b) => (
          <span
            key={b.key}
            className="h-full border-r-2 border-binus-950 last:border-r-0"
            style={{ width: width(b), background: fillOf(b) }}
          />
        ))}
      </span>
      {q.gradable && (
        <span className="mt-1 flex h-[3px] w-full px-[2px]">
          {segments.map((b) => (
            <span
              key={b.key}
              className={cn("h-full pr-0.5", b.isCorrect && "bg-desk-text bg-clip-content")}
              style={{ width: width(b) }}
            />
          ))}
        </span>
      )}
    </span>
  );
}

/** Option buckets keep their answer colour; typed responses read correct (kapas) or not (slate). */
function fillOf(b: ResponseBucket): string {
  if (b.slot !== null) return answerSlot(b.slot).color;
  return b.isCorrect ? "var(--ans-c)" : "var(--state-miss)";
}

function statusNote(q: QuestionAnalytics, t: ReturnType<typeof useI18n>["t"]) {
  return q.status === "skipped" ? t("analytics.skippedNote") : t("analytics.unplayedNote");
}
