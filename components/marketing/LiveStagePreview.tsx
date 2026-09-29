"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Lock } from "lucide-react";
import { AnswerSymbol, answerSlot } from "@/components/game/AnswerSymbol";
import { NusaAvatar } from "@/components/game/NusaAvatar";
import { NusaAnswer, type AnswerState } from "@/components/game/NusaAnswer";
import { NusaMeter } from "@/components/game/NusaProgress";
import { StreakFlame } from "@/components/game/StreakFlame";
import { NusaPattern } from "@/components/brand/NusaPattern";
import { OS_BATTLE } from "@/lib/seed/quizzes";
import { DEMO_PLAYERS } from "@/lib/seed/players";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";

const QUESTION = OS_BATTLE.questions[3]!; // "Algoritma scheduling mana yang menggunakan time quantum?"
const CORRECT = 1;
const DISTRIBUTION = [3, 30, 4, 1];
const TOTAL = 42;
const QUESTION_SECONDS = 9;
const REVEAL_SECONDS = 5;
const LOOP = QUESTION_SECONDS + REVEAL_SECONDS;

/**
 * A live, looping miniature of a real round: the projector counts down while
 * phones answer, then the reveal lands on both screens at once. Built from the
 * product's own components, so it is never out of sync with the real UI.
 */
export function LiveStagePreview({ className }: { className?: string }) {
  const t = useT();
  const reduce = useReducedMotion();
  const [tick, setTick] = useState(reduce ? QUESTION_SECONDS + 1 : 0);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setTick((v) => (v + 1) % LOOP), 1000);
    return () => window.clearInterval(id);
  }, [reduce]);

  const revealed = tick >= QUESTION_SECONDS;
  const secondsLeft = Math.max(0, QUESTION_SECONDS - tick);
  const answered = revealed ? 38 : Math.min(38, Math.round((tick / (QUESTION_SECONDS - 1)) * 38));
  const phoneLocked = tick >= 3;

  const stateFor = (i: number): AnswerState => {
    if (!revealed) return "idle";
    return i === CORRECT ? "correct" : "dimmed";
  };

  return (
    <div className={cn("relative select-none", className)} aria-hidden="true">
      {/* ------- projector ------- */}
      <div
        className="nf nf-xl @container relative overflow-visible p-[4.5cqw]"
        style={{
          ["--nf-fill" as string]: "#0c2458",
          ["--nf-stroke" as string]: "rgb(70 184 244 / 0.35)",
          ["--nf-stroke-w" as string]: "2px",
        }}
      >
        <NusaPattern kind="kawung" intensity="quiet" fade="edges" className="nf-clip" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <span className="hud-label text-[max(10px,1.7cqw)] text-stage-muted">{t("host.round")}</span>
            <span className="font-numeral text-[max(22px,5.2cqw)] leading-none text-kapas">
              04<span className="text-stage-faint"> / 10</span>
            </span>
          </div>
          <div className="relative grid size-[max(44px,9cqw)] place-items-center">
            <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="var(--stage-line)" strokeWidth="9" />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke={secondsLeft <= 3 && !revealed ? "var(--binus-yellow)" : "var(--binus-sky)"}
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={264}
                strokeDashoffset={264 * (1 - secondsLeft / QUESTION_SECONDS)}
                style={{ transition: "stroke-dashoffset 1s linear" }}
              />
            </svg>
            <span
              className={cn(
                "font-numeral text-[max(18px,4cqw)] leading-none",
                secondsLeft <= 3 && !revealed ? "text-sun" : "text-kapas",
              )}
            >
              {String(secondsLeft).padStart(2, "0")}
            </span>
          </div>
        </div>

        <p className="relative mt-[3cqw] max-w-[88%] text-[max(15px,3.6cqw)] leading-[1.15] font-extrabold text-balance text-kapas">
          {QUESTION.prompt}
        </p>

        <div className="relative mt-[3.5cqw] grid gap-[1.4cqw]">
          {QUESTION.answers.map((a, i) => (
            <NusaAnswer
              key={a.id}
              static
              position={i}
              text={a.text}
              order={i}
              state={stateFor(i)}
              share={revealed ? DISTRIBUTION[i]! / 38 : undefined}
              count={revealed ? DISTRIBUTION[i] : undefined}
              className="!min-h-[max(40px,7.5cqw)] [&_.nq-answer__chip]:!size-[max(28px,5.5cqw)] [&_.nq-answer__letter]:!text-[max(18px,3.6cqw)] [&_.nq-answer__text]:!text-[max(13px,2.6cqw)]"
            />
          ))}
        </div>

        <div className="relative mt-[3.5cqw] flex items-center gap-4">
          <div className="flex gap-1">
            {DEMO_PLAYERS.slice(0, 5).map((p, i) => (
              <motion.span
                key={p.id}
                initial={false}
                animate={{ scale: answered > i * 7 ? 1 : 0.6, opacity: answered > i * 7 ? 1 : 0.3 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
              >
                <NusaAvatar seed={p.avatarSeed} size={30} />
              </motion.span>
            ))}
          </div>
          <div className="flex-1">
            <NusaMeter value={answered} max={TOTAL} label="" />
          </div>
          <span className="font-numeral tabular text-[max(18px,3.2cqw)] leading-none whitespace-nowrap text-kapas">
            {answered}
            <span className="text-stage-faint">/{TOTAL}</span>
          </span>
        </div>
      </div>

      {/* ------- phone controller ------- */}
      <div className="absolute right-[-4%] bottom-[-14%] w-[36%] min-w-[150px] sm:right-[-7%]">
        <div
          className="nf nf-lg nf-solid border-kapas/10 p-3 pb-4 shadow-[0_30px_60px_-20px_rgb(2_9_24/0.8)]"
          style={{ ["--nf-stroke" as string]: "rgb(255 249 238 / .18)", ["--nf-stroke-w" as string]: "2px" }}
        >
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="hud-label text-[10px] text-stage-muted">SOAL 04</span>
            <span className="font-numeral text-lg leading-none text-kapas">{String(secondsLeft).padStart(2, "0")}</span>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            {revealed ? (
              <motion.div
                key="result"
                className="nf nf-md nf-sun px-3 py-4 text-center"
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 18 }}
              >
                <Check className="mx-auto" size={22} strokeWidth={3.5} />
                <p className="font-numeral mt-1 text-3xl leading-none">BENAR!</p>
                <p className="font-numeral mt-2 text-4xl leading-none">+850</p>
              </motion.div>
            ) : (
              <motion.div
                key="answers"
                className="grid gap-1.5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {[0, 1, 2, 3].map((i) => {
                  const slot = answerSlot(i);
                  const chosen = phoneLocked && i === CORRECT;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "nf nf-sm flex h-9 items-center gap-2 px-1.5",
                        chosen ? "" : "nf-solid",
                        phoneLocked && !chosen && "opacity-35",
                      )}
                      style={
                        chosen
                          ? { ["--nf-fill" as string]: slot.color, color: slot.ink }
                          : {
                              ["--nf-fill" as string]: "#0f2a60",
                              ["--nf-stroke" as string]: `color-mix(in oklab, ${slot.color} 40%, transparent)`,
                              ["--nf-stroke-w" as string]: "1.5px",
                            }
                      }
                    >
                      <span
                        className="nf nf-sm grid size-6 place-items-center"
                        style={{
                          ["--nf-fill" as string]: chosen ? slot.ink : slot.color,
                          color: chosen ? slot.color : slot.ink,
                        }}
                      >
                        <AnswerSymbol kind={slot.symbol} size={15} />
                      </span>
                      <span className={cn("font-numeral text-base leading-none", !chosen && "text-kapas")}>
                        {slot.letter}
                      </span>
                      {chosen && <Lock size={13} strokeWidth={3} className="mr-1 ml-auto" />}
                    </div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ------- floating fragments ------- */}
      <AnimatePresence>
        {revealed && (
          <>
            <motion.div
              key="streak"
              className="nf nf-md nf-energy absolute top-[18%] right-[-6%] hidden items-center gap-2 py-2 pr-5 pl-2 sm:flex"
              initial={{ opacity: 0, y: 12, rotate: -4 }}
              animate={{ opacity: 1, y: 0, rotate: -4 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.35, type: "spring", stiffness: 260, damping: 18 }}
            >
              <StreakFlame streak={4} size={26} />
              <span className="font-numeral text-3xl leading-none">×4</span>
              <span className="hud-label text-[10px]">STREAK</span>
            </motion.div>
            <motion.div
              key="rank"
              className="nf nf-md nf-kapas absolute bottom-[8%] left-[-5%] flex items-center gap-3 py-2 pr-5 pl-3"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.55, type: "spring", stiffness: 260, damping: 20 }}
            >
              <span className="hud-label text-[10px] text-binus-950/60">RANK</span>
              <span className="font-numeral text-2xl leading-none text-binus-950/40 line-through decoration-2">
                #07
              </span>
              <span className="font-numeral text-4xl leading-none text-binus-950">#04</span>
              <span className="text-sm font-extrabold text-energy-deep">▲3</span>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
