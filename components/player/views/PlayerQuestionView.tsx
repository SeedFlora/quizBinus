"use client";

import { useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Lock, RotateCcw } from "lucide-react";
/* eslint-disable @next/next/no-img-element -- lecturer-supplied media of unknown size */
import { NusaAnswer, type AnswerState } from "@/components/game/NusaAnswer";
import { NusaButton } from "@/components/ui/NusaButton";
import { NusaBadge } from "@/components/ui/NusaBadge";
import { PlayerHud } from "./PlayerHud";
import type { AnswerPayload, PublicQuestion } from "@/lib/game/types";
import { useT } from "@/lib/i18n/client";
import { getAudio, haptic } from "@/lib/audio/engine";
import { cn } from "@/lib/cn";

export interface PlayerQuestionViewProps {
  question: PublicQuestion;
  deadlineAt: number | null;
  clockOffsetMs: number;
  paused: boolean;
  pausedRemainingMs: number | null;
  /** Already-submitted answer (resume / optimistic). */
  submitted: AnswerPayload | null;
  onSubmit: (payload: AnswerPayload) => void;
}

/**
 * The phone as a controller. One tap locks a single-choice answer; multi-select,
 * ordering and typed answers get an explicit "Kunci jawaban" action.
 * Visual acknowledgement happens synchronously on tap (<150 ms), before any network.
 */
export function PlayerQuestionView(props: PlayerQuestionViewProps) {
  const { question, submitted, paused } = props;
  const t = useT();
  const reduce = useReducedMotion();
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [order, setOrder] = useState<string[]>([]);
  // The ref blocks a second tap within the same frame; the state drives rendering.
  const lockedRef = useRef(false);
  const [lockedLocal, setLockedLocal] = useState(false);
  const disabled = Boolean(submitted) || lockedLocal || paused;

  const lock = (payload: AnswerPayload) => {
    if (lockedRef.current || submitted) return; // no double submissions, ever
    lockedRef.current = true;
    setLockedLocal(true);
    haptic([10, 30, 18]);
    void getAudio().play("answer-lock");
    props.onSubmit(payload);
  };

  const submittedIds =
    submitted && (submitted.kind === "choice" || submitted.kind === "order") ? submitted.answerIds : [];
  const choiceState = (id: string): AnswerState => {
    if (submitted) return submittedIds.includes(id) ? "locked" : "dimmed";
    return picked.includes(id) ? "selected" : "idle";
  };

  const isChoice = question.type === "single" || question.type === "true_false" || question.type === "poll";
  const isMulti = question.type === "multiple";

  return (
    <div className="flex flex-1 flex-col">
      <PlayerHud
        index={question.index}
        total={question.total}
        timer={{
          deadlineAt: props.deadlineAt,
          clockOffsetMs: props.clockOffsetMs,
          paused,
          pausedRemainingMs: props.pausedRemainingMs,
          totalSeconds: question.timeLimit,
        }}
      />

      <motion.div
        className="mt-6"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex flex-wrap items-center gap-2">
          {question.topic && <NusaBadge size="sm">{question.topic}</NusaBadge>}
          {question.type === "poll" && (
            <NusaBadge size="sm" tone="sky">
              {t("play.pollLabel")}
            </NusaBadge>
          )}
          {question.points > 1000 && (
            <NusaBadge size="sm" tone="sun">
              ×2 PTS
            </NusaBadge>
          )}
        </div>
        <h1 className="mt-3 text-[1.5rem] leading-[1.22] font-extrabold text-pretty text-kapas">{question.prompt}</h1>
        {question.mediaUrl && (
          <img
            src={question.mediaUrl}
            alt=""
            className="nf-clip mt-4 max-h-44 w-full object-cover"
            style={{ ["--nf-tl" as string]: "10px" }}
          />
        )}
      </motion.div>

      <div className="mt-auto pt-6">
        {paused && (
          <p className="mb-3 text-center text-sm font-bold text-miss" role="status">
            {t("play.pausedSub")}
          </p>
        )}

        {(isChoice || isMulti) && (
          <>
            {isMulti && !submitted && (
              <p className="hud-label mb-3 text-stage-muted">
                {t("play.chooseMany", { count: question.selectCount ?? 2 })}
              </p>
            )}
            <div className="grid gap-2.5" role={isMulti ? "group" : undefined} aria-label={t("play.chooseAnswer")}>
              {question.answers.map((a, i) => (
                <NusaAnswer
                  key={a.id}
                  position={question.type === "true_false" ? i : a.position}
                  text={a.text}
                  order={i}
                  multi={isMulti}
                  disabled={disabled}
                  state={choiceState(a.id)}
                  className={cn(question.type === "true_false" && "min-h-[88px]")}
                  onSelect={() => {
                    if (isMulti) {
                      haptic(8);
                      setPicked((p) => (p.includes(a.id) ? p.filter((x) => x !== a.id) : [...p, a.id]));
                    } else {
                      setPicked([a.id]);
                      lock({ kind: "choice", answerIds: [a.id] });
                    }
                  }}
                />
              ))}
            </div>
            {isMulti && !submitted && (
              <NusaButton
                size="lg"
                variant="sun"
                block
                className="mt-4"
                disabled={picked.length === 0 || disabled}
                icon={<Lock size={18} aria-hidden="true" />}
                onClick={() => lock({ kind: "choice", answerIds: picked })}
              >
                {t("play.lockAnswer")}
              </NusaButton>
            )}
          </>
        )}

        {question.type === "ordering" && (
          <OrderingInput
            question={question}
            order={submitted?.kind === "order" ? submitted.answerIds : order}
            locked={Boolean(submitted)}
            disabled={disabled}
            onChange={setOrder}
            onLock={() => lock({ kind: "order", answerIds: order })}
          />
        )}

        {(question.type === "short_answer" || question.type === "numeric") && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = text.trim();
              if (!value) return;
              if (question.type === "numeric") {
                const n = Number(value.replace(",", "."));
                if (Number.isFinite(n)) lock({ kind: "number", value: n });
              } else lock({ kind: "text", value });
            }}
          >
            <label className="hud-label mb-3 block text-stage-muted" htmlFor="typed-answer">
              {question.type === "numeric" ? t("play.numberAnswer") : t("play.typeAnswer")}
            </label>
            <div
              className="nf nf-md nf-outline focus-within:[--nf-stroke:var(--binus-yellow)]"
              style={{ ["--nf-stroke-w" as string]: "2px" }}
            >
              <input
                id="typed-answer"
                value={
                  submitted?.kind === "text"
                    ? submitted.value
                    : submitted?.kind === "number"
                      ? String(submitted.value)
                      : text
                }
                onChange={(e) => setText(e.target.value)}
                inputMode={question.type === "numeric" ? "decimal" : "text"}
                autoComplete="off"
                enterKeyHint="send"
                disabled={disabled}
                maxLength={120}
                className="h-16 w-full bg-transparent px-5 text-2xl font-bold text-kapas outline-none"
              />
            </div>
            {question.unit && <p className="mt-2 text-sm text-stage-muted">{question.unit}</p>}
            {!submitted && (
              <NusaButton
                type="submit"
                size="lg"
                variant="sun"
                block
                className="mt-4"
                disabled={!text.trim() || disabled}
                icon={<Lock size={18} aria-hidden="true" />}
              >
                {t("play.lockAnswer")}
              </NusaButton>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

function OrderingInput({
  question,
  order,
  locked,
  disabled,
  onChange,
  onLock,
}: {
  question: PublicQuestion;
  order: string[];
  locked: boolean;
  disabled: boolean;
  onChange: (next: string[]) => void;
  onLock: () => void;
}) {
  const t = useT();
  const remaining = question.answers.filter((a) => !order.includes(a.id));
  const byId = new Map(question.answers.map((a) => [a.id, a] as const));
  return (
    <div>
      <p className="hud-label mb-3 text-stage-muted">{t("play.orderHint")}</p>
      <ol className="grid gap-2">
        {order.map((id, i) => (
          <li key={id} className="nf nf-md nf-kapas flex min-h-14 items-center gap-3 px-4 py-2 font-bold">
            <span className="font-numeral text-2xl">{i + 1}</span>
            <span className="text-binus-950">{byId.get(id)?.text}</span>
          </li>
        ))}
      </ol>
      {!locked && (
        <div className="mt-3 grid gap-2">
          {remaining.map((a) => (
            <button
              key={a.id}
              type="button"
              disabled={disabled}
              onClick={() => {
                haptic(8);
                onChange([...order, a.id]);
              }}
              className="nf nf-md nf-outline min-h-14 px-4 py-2 text-left font-bold text-kapas"
            >
              {a.text}
            </button>
          ))}
        </div>
      )}
      {!locked && (
        <div className="mt-4 grid grid-cols-[auto_1fr] gap-3">
          <NusaButton
            variant="ghost"
            size="lg"
            onClick={() => onChange([])}
            disabled={order.length === 0 || disabled}
            icon={<RotateCcw size={18} aria-hidden="true" />}
          >
            {t("play.resetOrder")}
          </NusaButton>
          <NusaButton
            variant="sun"
            size="lg"
            onClick={onLock}
            disabled={remaining.length > 0 || disabled}
            icon={<Lock size={18} aria-hidden="true" />}
          >
            {t("play.lockAnswer")}
          </NusaButton>
        </div>
      )}
    </div>
  );
}
