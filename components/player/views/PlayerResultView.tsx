"use client";

import { useEffect } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, Clock3, Minus } from "lucide-react";
import { AnswerSymbol, answerSlot } from "@/components/game/AnswerSymbol";
import { KawungBurst } from "@/components/game/KawungBurst";
import { NusaScore } from "@/components/game/NusaScore";
import { NusaRankTransition, RankMovement } from "@/components/game/NusaRank";
import { StreakFlame } from "@/components/game/StreakFlame";
import type { PlayerQuestionResult, PublicQuestion, QuestionReveal } from "@/lib/game/types";
import { shakeKeyframes, shakeTransition } from "@/lib/motion";
import { useT } from "@/lib/i18n/client";
import { getAudio, haptic } from "@/lib/audio/engine";
import { cn } from "@/lib/cn";

/**
 * Per-question result on the phone. Correct: radial burst, points count up.
 * Not quite: a small controlled shake, slate (never red), and the right answer
 * with its explanation, so the moment still teaches something.
 */
export function PlayerResultView({
  question,
  reveal,
  result,
  totalPlayers,
}: {
  question: PublicQuestion;
  reveal: QuestionReveal;
  result: PlayerQuestionResult;
  totalPlayers: number;
}) {
  const t = useT();
  const reduce = useReducedMotion();
  const isPoll = question.type === "poll";
  const outcome: "correct" | "miss" | "none" | "poll" = isPoll
    ? "poll"
    : !result.answered
      ? "none"
      : result.isCorrect
        ? "correct"
        : "miss";
  const climbed = result.previousRank !== null ? result.previousRank - result.rank : 0;

  useEffect(() => {
    if (outcome === "correct") {
      void getAudio().play("correct");
      haptic([20, 40, 20]);
      if (result.streak >= 3) window.setTimeout(() => void getAudio().play("streak"), 450);
      if (climbed > 0) window.setTimeout(() => void getAudio().play("rank-up"), 900);
    } else if (outcome === "miss" || outcome === "none") {
      void getAudio().play("incorrect");
      haptic(40);
    }
  }, [outcome, result.streak, climbed]);

  const headline =
    outcome === "correct"
      ? t("result.correct")
      : outcome === "miss"
        ? t("result.incorrect")
        : outcome === "none"
          ? t("result.noAnswer")
          : t("play.pollLabel");

  const message =
    outcome === "correct"
      ? climbed > 0
        ? t("result.rankUp", { count: climbed })
        : result.streak >= 2
          ? t("result.keepStreak")
          : t("result.rankSame")
      : outcome === "poll"
        ? ""
        : t("result.encourage");

  const correctAnswers = question.answers.filter((a) => reveal.correctAnswerIds.includes(a.id));

  return (
    <div className="flex flex-1 flex-col">
      {/* headline block */}
      <motion.div
        className="relative mt-6 flex flex-col items-center text-center"
        animate={!reduce && outcome === "miss" ? shakeKeyframes : undefined}
        transition={shakeTransition}
      >
        {outcome === "correct" && <KawungBurst size={300} />}
        <motion.div
          className={cn("nf nf-lg grid size-20 place-items-center", outcome === "correct" ? "nf-sun" : "")}
          style={
            outcome === "correct"
              ? undefined
              : {
                  ["--nf-fill" as string]: "color-mix(in oklab, var(--state-miss) 35%, var(--stage-base))",
                  color: "var(--nusantara-white)",
                }
          }
          initial={reduce ? { opacity: 0 } : { scale: 0.3, rotate: -12, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 14 }}
        >
          {outcome === "correct" ? (
            <Check size={44} strokeWidth={3.5} aria-hidden="true" />
          ) : outcome === "none" ? (
            <Clock3 size={40} strokeWidth={2.75} aria-hidden="true" />
          ) : (
            <Minus size={44} strokeWidth={3.5} aria-hidden="true" />
          )}
        </motion.div>
        <h1
          className={cn(
            "font-numeral mt-5 text-[clamp(3.75rem,20vw,6rem)] leading-[0.85] uppercase",
            outcome === "correct" ? "text-sun" : "text-kapas",
          )}
          aria-live="assertive"
        >
          {headline}
        </h1>
        {!isPoll && (
          <p
            className={cn(
              "font-numeral mt-3 text-[clamp(3rem,16vw,4.75rem)] leading-none",
              outcome === "correct" ? "text-kapas" : "text-stage-faint",
            )}
          >
            <NusaScore
              value={result.pointsAwarded}
              prefix="+"
              suffix=" PTS"
              delay={0.35}
              label={t("result.pointsGained", { points: result.pointsAwarded })}
            />
          </p>
        )}
      </motion.div>

      {/* stat strip */}
      {!isPoll && (
        <dl className="mt-8 grid grid-cols-3 gap-2">
          <Stat label={t("result.speed")} delay={0.5}>
            <span className="font-numeral text-3xl leading-none text-kapas">
              {result.responseTimeMs !== null ? (
                <>
                  {(result.responseTimeMs / 1000).toFixed(1)}
                  <span className="text-lg text-stage-muted">s</span>
                </>
              ) : (
                "–"
              )}
            </span>
          </Stat>
          <Stat label={t("result.streak")} delay={0.6}>
            <span className="flex items-end gap-1">
              <StreakFlame streak={result.streak} size={22} />
              <span className="font-numeral text-3xl leading-none text-kapas">×{result.streak}</span>
            </span>
          </Stat>
          <Stat label={t("result.rank")} delay={0.7}>
            <span className="flex items-baseline gap-1.5">
              <NusaRankTransition
                from={result.previousRank}
                to={result.rank}
                delay={1100}
                className="text-3xl text-kapas"
              />
              <RankMovement previous={result.previousRank} current={result.rank} size="sm" />
            </span>
          </Stat>
        </dl>
      )}

      {message && (
        <motion.p
          className={cn("mt-5 text-center text-lg font-extrabold", outcome === "correct" ? "text-sun" : "text-kapas")}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
        >
          {message}
        </motion.p>
      )}

      {/* teach, don't just judge */}
      {outcome !== "correct" && !isPoll && (correctAnswers.length > 0 || reveal.correctText) && (
        <motion.div
          className="mt-auto pt-8"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          <p className="hud-label mb-3 text-stage-muted">{t("result.correctAnswerWas")}</p>
          <div className="grid gap-2">
            {correctAnswers.map((a) => {
              const slot = answerSlot(question.type === "true_false" ? question.answers.indexOf(a) : a.position);
              return (
                <div
                  key={a.id}
                  className="nf nf-md flex items-center gap-3 py-2 pr-5 pl-2"
                  style={{ ["--nf-fill" as string]: slot.color, color: slot.ink }}
                >
                  <span
                    className="nf nf-sm grid size-10 place-items-center"
                    style={{ ["--nf-fill" as string]: slot.ink, color: slot.color }}
                  >
                    <AnswerSymbol kind={slot.symbol} size={22} />
                  </span>
                  <span className="font-numeral text-2xl leading-none">{slot.letter}</span>
                  <span className="font-bold">{a.text}</span>
                </div>
              );
            })}
            {correctAnswers.length === 0 && reveal.correctText && (
              <p className="nf nf-md nf-kapas px-5 py-3 font-bold">{reveal.correctText}</p>
            )}
          </div>
          {reveal.explanation && <p className="mt-4 text-sm leading-relaxed text-stage-muted">{reveal.explanation}</p>}
        </motion.div>
      )}

      <div className={cn("flex items-baseline justify-between pt-6", outcome === "correct" || isPoll ? "mt-auto" : "")}>
        <span className="hud-label text-stage-muted">{t("result.totalScore")}</span>
        <span className="font-numeral text-3xl leading-none text-kapas">
          <NusaScore value={result.score} from={result.score - result.pointsAwarded} delay={0.6} />
        </span>
      </div>
      <p className="mt-1 text-right text-xs text-stage-faint">
        #{result.rank} / {totalPlayers}
      </p>
    </div>
  );
}

function Stat({ label, delay, children }: { label: string; delay: number; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="nf nf-md nf-solid flex min-h-24 flex-col justify-between px-3 py-3"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <dt className="hud-label text-[10px] text-stage-muted">{label}</dt>
      <dd className="mt-2">{children}</dd>
    </motion.div>
  );
}
