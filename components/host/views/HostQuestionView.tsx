"use client";

/* eslint-disable @next/next/no-img-element -- lecturer-supplied media */
import { motion, useReducedMotion } from "motion/react";
import { Zap } from "lucide-react";
import { NusaAnswer, type AnswerState } from "@/components/game/NusaAnswer";
import { NusaMeter } from "@/components/game/NusaProgress";
import { NusaTimer } from "@/components/game/NusaTimer";
import { HostHud } from "./HostHud";
import type { PublicQuestion, QuestionReveal, SessionSnapshot } from "@/lib/game/types";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";

/**
 * Question + reveal on the projector. The same layout serves both phases so the
 * reveal feels like the room "turning over" the answers rather than a new screen:
 * distribution bars grow out of the answer bars, the correct one floods with colour.
 */
export function HostQuestionView({
  snapshot,
  question,
  reveal,
  clockOffsetMs,
}: {
  snapshot: SessionSnapshot;
  question: PublicQuestion;
  reveal: QuestionReveal | null;
  clockOffsetMs: number;
}) {
  const t = useT();
  const reduce = useReducedMotion();
  const total = snapshot.players.length;
  const answered = reveal ? reveal.stats.answered : snapshot.answeredCount;
  const counts = new Map(reveal?.distribution.map((d) => [d.answerId, d.count]) ?? []);
  const isChoice = question.answers.length > 0 && question.type !== "ordering";
  const isFinal = question.index === question.total - 1;

  const stateFor = (id: string): AnswerState => {
    if (!reveal) return "idle";
    if (question.type === "poll") return "idle";
    return reveal.correctAnswerIds.includes(id) ? "correct" : "dimmed";
  };

  // Most-chosen wrong answer → the misconception worth talking about.
  const misconception = reveal
    ? question.answers
        .filter((a) => !reveal.correctAnswerIds.includes(a.id))
        .map((a) => ({ a, n: counts.get(a.id) ?? 0 }))
        .sort((x, y) => y.n - x.n)[0]
    : undefined;
  const showMisconception =
    misconception && reveal && reveal.stats.answered > 0 && misconception.n / reveal.stats.answered >= 0.2;

  return (
    <div className="flex h-full flex-col">
      <HostHud
        index={question.index}
        total={question.total}
        topic={question.topic}
        roomCode={snapshot.roomCode}
        isFinal={isFinal}
        right={
          !reveal && (
            <NusaTimer
              size="host"
              sound
              totalSeconds={question.timeLimit}
              deadlineAt={snapshot.deadlineAt}
              clockOffsetMs={clockOffsetMs}
              paused={snapshot.paused}
              pausedRemainingMs={snapshot.pausedRemainingMs}
              className="!size-[clamp(120px,14vh,220px)] [&_.font-numeral]:!text-[clamp(3rem,7vh,7rem)] [&>svg]:!size-full"
            />
          )
        }
      />

      {/* 4:3 stacks the question over the answers. The overrides are utilities on purpose:
          stage.css's .host-question-grid rule sits in the components layer and loses to grid-cols-*. */}
      <div className="host-question-grid mt-[4vh] grid min-h-0 flex-1 grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-[3.5vw] [@media(max-aspect-ratio:4/3)]:mt-[2vh] [@media(max-aspect-ratio:4/3)]:grid-cols-1 [@media(max-aspect-ratio:4/3)]:grid-rows-[auto_minmax(0,1fr)] [@media(max-aspect-ratio:4/3)]:gap-[2vh]">
        {/* question */}
        <div className="flex min-h-0 flex-col">
          <motion.h1
            className="text-[clamp(2.25rem,3.9vw,4.75rem)] leading-[1.08] font-extrabold tracking-[-0.01em] text-balance text-kapas"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            {question.prompt}
          </motion.h1>
          {question.description && (
            <p className="mt-4 text-[clamp(1.1rem,1.5vw,1.75rem)] text-stage-muted">{question.description}</p>
          )}
          {question.mediaUrl && (
            <img
              src={question.mediaUrl}
              alt=""
              className="nf-clip mt-[3vh] max-h-[34vh] w-auto self-start object-contain"
              style={{
                ["--nf-tl" as string]: "14px",
                ["--nf-cut" as string]: "28px",
                ["--nf-br" as string]: "44px",
                ["--nf-notch" as string]: "12px",
              }}
            />
          )}

          {reveal ? (
            <RevealStats
              reveal={reveal}
              question={question}
              misconception={showMisconception ? misconception : undefined}
            />
          ) : (
            // At 4:3 the answered meter moves into the bottom band beside the host controls.
            <div
              className="mt-auto [@media(max-aspect-ratio:4/3)]:absolute [@media(max-aspect-ratio:4/3)]:bottom-[var(--host-safe)] [@media(max-aspect-ratio:4/3)]:left-[var(--host-safe)] [@media(max-aspect-ratio:4/3)]:w-[38%]"
              aria-live="polite"
            >
              <div className="flex items-baseline gap-4">
                <span className="font-numeral tabular text-[clamp(3.5rem,6vw,7.5rem)] leading-[0.8] text-kapas">
                  {answered}
                  <span className="text-stage-faint"> / {total}</span>
                </span>
                <span className="hud-label text-[clamp(14px,1.2vw,24px)] text-stage-muted">{t("host.answered")}</span>
              </div>
              <NusaMeter
                className="mt-4 !h-4"
                value={answered}
                max={Math.max(total, 1)}
                label={t("play.answeredCount", { answered, total })}
                tone={answered === total && total > 0 ? "sun" : "sky"}
              />
              {snapshot.paused && (
                <p className="mt-4 text-[clamp(1.1rem,1.4vw,1.6rem)] font-extrabold text-miss">{t("play.paused")}</p>
              )}
            </div>
          )}
        </div>

        {/* answers */}
        <div className="flex min-h-0 flex-col justify-center gap-[1.6vh] [@media(max-aspect-ratio:4/3)]:gap-[1.2vh] [@media(max-aspect-ratio:4/3)]:pb-[clamp(72px,11vh,120px)]">
          {isChoice &&
            question.answers.map((a, i) => (
              <NusaAnswer
                key={a.id}
                static
                size="host"
                className="[@media(max-aspect-ratio:4/3)]:min-h-[64px] [@media(max-aspect-ratio:4/3)]:py-2 [@media(max-aspect-ratio:4/3)]:[&_.nf-sm]:size-[clamp(48px,6.5vh,72px)] [@media(max-aspect-ratio:4/3)]:[&_.nf-sm_svg]:size-[60%]"
                position={question.type === "true_false" ? i : a.position}
                text={a.text}
                order={i}
                state={stateFor(a.id)}
                share={
                  reveal && reveal.stats.answered > 0 ? (counts.get(a.id) ?? 0) / reveal.stats.answered : undefined
                }
                count={reveal ? (counts.get(a.id) ?? 0) : undefined}
              />
            ))}
          {!isChoice && reveal?.correctText && (
            <div className="nf nf-lg nf-sun px-8 py-8">
              <p className="hud-label text-binus-950/60">{t("host.correctAnswer")}</p>
              <p className="mt-3 text-[clamp(1.75rem,3vw,3.25rem)] leading-tight font-extrabold text-binus-950">
                {reveal.correctText}
              </p>
            </div>
          )}
          {!isChoice && !reveal && (
            <div className={cn("nf nf-lg nf-outline grid place-items-center px-8 py-16 text-center")}>
              <p className="text-[clamp(1.25rem,2vw,2rem)] font-bold text-stage-muted">
                {question.type === "ordering"
                  ? t("play.orderHint")
                  : question.type === "numeric"
                    ? t("play.numberAnswer")
                    : t("play.typeAnswer")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RevealStats({
  reveal,
  question,
  misconception,
}: {
  reveal: QuestionReveal;
  question: PublicQuestion;
  misconception?: { a: { text: string }; n: number };
}) {
  const t = useT();
  const reduce = useReducedMotion();
  const pct = Math.round(reveal.stats.accuracy * 100);
  const item = (delay: number) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] as const },
  });
  if (question.type === "poll") return <div className="mt-auto" />;
  return (
    // 4:3: stats and insight sit side by side so the stacked answers keep their room.
    <div className="mt-auto [@media(max-aspect-ratio:4/3)]:mt-[2.5vh] [@media(max-aspect-ratio:4/3)]:flex [@media(max-aspect-ratio:4/3)]:items-end [@media(max-aspect-ratio:4/3)]:gap-[3vw]">
      <div className="flex flex-wrap items-end gap-x-[3vw] gap-y-4 [@media(max-aspect-ratio:4/3)]:shrink-0">
        <motion.div {...item(0.3)}>
          <p className="font-numeral text-[clamp(5rem,9vw,11rem)] leading-[0.8] text-sun">{pct}%</p>
          <p className="hud-label mt-2 text-[clamp(14px,1.2vw,22px)] text-stage-muted">{t("host.correctRate")}</p>
        </motion.div>
        <motion.div {...item(0.45)}>
          <p className="font-numeral text-[clamp(2.5rem,4vw,5rem)] leading-[0.85] text-kapas">
            {(reveal.stats.averageResponseMs / 1000).toFixed(1)}
            <span className="text-[0.55em] text-stage-muted">s</span>
          </p>
          <p className="hud-label mt-2 text-[clamp(12px,1vw,18px)] text-stage-muted">{t("host.avgResponse")}</p>
        </motion.div>
        {reveal.stats.fastestPlayer && (
          <motion.div {...item(0.6)} className="min-w-0">
            <p className="flex items-center gap-2 text-[clamp(1.5rem,2.2vw,2.75rem)] leading-[1.15] font-extrabold text-kapas">
              <Zap className="shrink-0 text-sun" size={32} fill="currentColor" aria-hidden="true" />
              <span className="min-w-0 truncate">{reveal.stats.fastestPlayer.nickname}</span>
            </p>
            <p className="hud-label mt-2 text-[clamp(12px,1vw,18px)] text-stage-muted">
              {t("host.fastest")} ·{" "}
              <span className="normal-case">{(reveal.stats.fastestPlayer.responseTimeMs / 1000).toFixed(1)}s</span>
            </p>
          </motion.div>
        )}
      </div>
      {(misconception || reveal.explanation) && (
        <motion.p
          {...item(0.9)}
          className="mt-[3vh] max-w-[60ch] border-l-4 border-sun/60 pl-5 text-[clamp(1rem,1.35vw,1.6rem)] leading-snug text-stage-muted [@media(max-aspect-ratio:4/3)]:mt-0 [@media(max-aspect-ratio:4/3)]:min-w-0 [@media(max-aspect-ratio:4/3)]:flex-1"
        >
          {misconception
            ? t("host.insightMisconception", {
                percent: Math.round((misconception.n / Math.max(1, reveal.stats.answered)) * 100),
                answer: misconception.a.text,
              })
            : reveal.explanation}
        </motion.p>
      )}
    </div>
  );
}
