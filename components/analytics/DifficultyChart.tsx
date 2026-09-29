"use client";

import { motion, useReducedMotion } from "motion/react";
import { DIFFICULTY_BANDS, type QuestionAnalytics } from "@/lib/analytics/compute";
import { pad2, toPercent } from "@/lib/analytics/format";
import type { Difficulty } from "@/lib/game/types";
import { useT } from "@/lib/i18n/client";
import { stagger, transition } from "@/lib/motion";
import { cn } from "@/lib/cn";
import { questionLabel } from "./labels";

const PLOT_HEIGHT = 240;

/** Mastered reads calm (ink), middling reads institutional (blue), hard asks for attention (energy). */
const FILL: Record<Difficulty, string> = {
  mudah: "bg-desk-text",
  sedang: "bg-binus-500",
  sulit: "bg-energy",
};

/**
 * Accuracy per question as a skyline of parang-topped columns over the three
 * difficulty bands. Every column is a button that opens the question's answer
 * distribution; its accessible name carries the number, topic, accuracy and band,
 * so nothing depends on colour or on seeing the bar height.
 */
export function DifficultyChart({
  questions,
  onOpenQuestion,
}: {
  questions: QuestionAnalytics[];
  onOpenQuestion: (questionId: string) => void;
}) {
  const t = useT();
  const reduce = useReducedMotion();
  const dense = questions.length > 12;
  const crowded = questions.length > 24;
  const easyLine = DIFFICULTY_BANDS.easyAbove * 100;
  const hardLine = DIFFICULTY_BANDS.hardAtMost * 100;

  return (
    <section aria-labelledby="difficulty-title" className="nf nf-lg nf-desk p-6 sm:p-8">
      <h2 id="difficulty-title" className="font-display-tight text-2xl text-desk-text">
        {t("analytics.difficulty")}
      </h2>
      <p id="difficulty-sub" className="mt-1.5 max-w-[62ch] text-sm text-desk-muted">
        {t("analytics.difficultySub")}
      </p>

      {/* Container queries: topic names only when each column has room for them. */}
      <div className="@container relative mt-8 pl-[4.5rem]">
        {/* Band guides: dashed thresholds, zone names in the gutter. */}
        <div aria-hidden="true" className="absolute inset-x-0 top-0" style={{ height: PLOT_HEIGHT }}>
          <div
            className="absolute inset-x-0 bottom-0 left-[4.5rem] bg-desk-sunken/60"
            style={{ height: `${hardLine}%` }}
          />
          {[easyLine, hardLine].map((line) => (
            <div key={line} className="absolute inset-x-0" style={{ bottom: `${line}%` }}>
              <div className="ml-[4.5rem] border-t border-dashed border-desk-faint/70" />
              <span className="tabular absolute left-0 -translate-y-1/2 text-[11px] font-bold text-desk-faint">
                {line}%
              </span>
            </div>
          ))}
          <div className="absolute inset-x-0 bottom-0 ml-[4.5rem] border-t border-desk-line" />
          <Zone from={easyLine} to={100} label={t("creator.difficulty.mudah")} />
          <Zone from={hardLine} to={easyLine} label={t("creator.difficulty.sedang")} />
          <Zone from={0} to={hardLine} label={t("creator.difficulty.sulit")} />
        </div>

        <ol
          aria-describedby="difficulty-sub"
          className={cn("relative flex", dense ? "gap-1.5" : "gap-[clamp(6px,1.4vw,18px)]")}
        >
          {questions.map((q, i) => {
            const played = q.status === "played";
            const accuracy = q.accuracy;
            const name =
              played && accuracy !== null && q.difficulty
                ? `${questionLabel(t, q.number, q.topic)}: ${toPercent(accuracy)}% · ${t(`creator.difficulty.${q.difficulty}`)}`
                : `${questionLabel(t, q.number, q.topic)}: ${statusText(q, t)}`;
            return (
              <li key={q.id} className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onOpenQuestion(q.id)}
                  aria-label={t("analytics.questionDetails", { n: q.number }) + ` — ${name}`}
                  className="group flex w-full flex-col items-center rounded-[6px_2px_10px_2px] outline-offset-4"
                >
                  <span className="flex w-full flex-col items-center justify-end" style={{ height: PLOT_HEIGHT }}>
                    {played && accuracy !== null && q.difficulty ? (
                      <>
                        {!crowded && (
                          <span
                            className={cn(
                              "font-numeral mb-1.5 leading-none text-desk-text",
                              dense ? "text-sm" : "text-xl",
                            )}
                          >
                            {toPercent(accuracy)}
                            <span className="text-[0.6em] text-desk-muted">%</span>
                          </span>
                        )}
                        <motion.span
                          aria-hidden="true"
                          className={cn(
                            "block w-full max-w-[60px] origin-bottom transition-[filter] group-hover:brightness-110",
                            FILL[q.difficulty],
                          )}
                          style={{
                            height: `max(3px, ${accuracy * 100}%)`,
                            // Parang cut: the column top slants like the progress bars on stage.
                            clipPath: "polygon(0 9px, 100% 0, 100% 100%, 0 100%)",
                          }}
                          initial={reduce ? false : { scaleY: 0 }}
                          animate={{ scaleY: 1 }}
                          transition={{ ...transition.game, delay: i * stagger.list }}
                        />
                      </>
                    ) : (
                      <span className="mb-0 flex h-full w-full max-w-[60px] items-end justify-center border border-dashed border-desk-faint pb-2 text-center text-[10px] leading-tight font-bold text-desk-muted [writing-mode:vertical-rl]">
                        {statusText(q, t)}
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "font-numeral mt-3 leading-none text-desk-text transition-colors group-hover:text-binus-500",
                      dense ? "text-base" : "text-[1.75rem]",
                    )}
                  >
                    {pad2(q.number)}
                  </span>
                  {!dense && (
                    <span className="mt-1 hidden min-h-[2lh] w-full text-xs leading-tight @3xl:block">
                      <span className="line-clamp-2 text-center font-semibold text-desk-muted">{q.topic ?? ""}</span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function Zone({ from, to, label }: { from: number; to: number; label: string }) {
  return (
    <span
      className="absolute left-0 flex w-[3.75rem] items-center text-xs font-bold text-desk-muted"
      style={{ bottom: `${from}%`, height: `${to - from}%` }}
    >
      {label}
    </span>
  );
}

function statusText(q: QuestionAnalytics, t: ReturnType<typeof useT>) {
  if (q.status === "skipped") return t("analytics.skipped");
  if (q.status === "unplayed") return t("analytics.notPlayed");
  // Played without a percentage: a poll, or a graded question nobody answered in time.
  return q.gradable ? t("analytics.noAnswer") : t("editor.types.poll");
}
