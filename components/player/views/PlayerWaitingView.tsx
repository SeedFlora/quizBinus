"use client";

import { motion, useReducedMotion } from "motion/react";
import { Lock } from "lucide-react";
import { AnswerSymbol, answerSlot } from "@/components/game/AnswerSymbol";
import { NusaMeter } from "@/components/game/NusaProgress";
import type { AnswerPayload, PublicQuestion } from "@/lib/game/types";
import { useT } from "@/lib/i18n/client";

/** "Jawaban terkunci. Lihat layar utama." Calm, confident, nothing to do but wait. */
export function PlayerWaitingView({
  question,
  answer,
  answeredCount,
  totalPlayers,
}: {
  question: PublicQuestion;
  answer: AnswerPayload;
  answeredCount: number;
  totalPlayers: number;
}) {
  const t = useT();
  const reduce = useReducedMotion();
  const chosen = answer.kind === "choice" ? question.answers.filter((a) => answer.answerIds.includes(a.id)) : [];

  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <motion.div
        className="nf nf-xl nf-sun grid size-40 place-items-center"
        initial={reduce ? { opacity: 0 } : { scale: 1.4, rotate: -8, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 16 }}
      >
        <Lock size={72} strokeWidth={2.5} aria-hidden="true" />
      </motion.div>

      <h1 className="font-numeral mt-10 text-[clamp(3rem,15vw,4.25rem)] leading-[0.88] text-kapas uppercase">
        {t("play.locked")}
      </h1>
      <p className="mt-3 text-lg text-stage-muted">{t("play.lockedSub")}</p>

      {chosen.length > 0 && (
        <ul className="mt-8 flex flex-wrap justify-center gap-2" aria-label={t("play.locked")}>
          {chosen.map((a) => {
            const slot = answerSlot(question.type === "true_false" ? question.answers.indexOf(a) : a.position);
            return (
              <li
                key={a.id}
                className="nf nf-md flex items-center gap-2 py-2 pr-5 pl-2"
                style={{ ["--nf-fill" as string]: slot.color, color: slot.ink }}
              >
                <span
                  className="nf nf-sm grid size-8 place-items-center"
                  style={{ ["--nf-fill" as string]: slot.ink, color: slot.color }}
                >
                  <AnswerSymbol kind={slot.symbol} size={18} />
                </span>
                <span className="font-numeral text-xl leading-none">{slot.letter}</span>
                {/* Up to two lines: the student should be able to read what they locked in. */}
                <span className="line-clamp-2 min-w-0 text-left leading-snug font-bold">{a.text}</span>
              </li>
            );
          })}
        </ul>
      )}
      {answer.kind === "text" && <p className="mt-8 text-xl font-bold text-kapas">“{answer.value}”</p>}
      {answer.kind === "number" && <p className="font-numeral mt-8 text-5xl text-kapas">{answer.value}</p>}

      <div className="mt-auto w-full pt-10">
        <div className="flex items-baseline justify-between">
          <span className="hud-label text-stage-muted">{t("host.answered")}</span>
          <span className="font-numeral tabular text-2xl leading-none text-kapas">
            {answeredCount}
            <span className="text-stage-faint">/{totalPlayers}</span>
          </span>
        </div>
        <NusaMeter
          className="mt-3"
          value={answeredCount}
          max={totalPlayers}
          label={t("play.answeredCount", { answered: answeredCount, total: totalPlayers })}
        />
      </div>
    </div>
  );
}
