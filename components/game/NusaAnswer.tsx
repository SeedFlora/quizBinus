"use client";

import { motion, useReducedMotion } from "motion/react";
import { Check, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { AnswerSymbol, answerSlot } from "./AnswerSymbol";

export type AnswerState = "idle" | "selected" | "locked" | "correct" | "wrong-pick" | "dimmed";

export interface NusaAnswerProps {
  /** 0-based position; determines colour, symbol and letter. */
  position: number;
  text: string;
  state?: AnswerState;
  size?: "phone" | "host";
  /** Toggle semantics (multiple-select) instead of one-tap submit. */
  multi?: boolean;
  disabled?: boolean;
  /** Host reveal: share of players who picked it (0..1) and count. */
  share?: number;
  count?: number;
  /** Extra status text, e.g. "Pilihanmu". */
  status?: ReactNode;
  /** Index for entrance stagger. */
  order?: number;
  onSelect?: () => void;
  /** Render as a non-interactive element (host screens). */
  static?: boolean;
  className?: string;
}

/**
 * The answer bar. On phones it is a large NUSA FRAME button; on the projector it
 * is a static bar that later shows the answer distribution.
 */
export function NusaAnswer({
  position,
  text,
  state = "idle",
  size = "phone",
  multi,
  disabled,
  share,
  count,
  status,
  order = 0,
  onSelect,
  static: isStatic,
  className,
}: NusaAnswerProps) {
  const reduce = useReducedMotion();
  const slot = answerSlot(position);
  const symbolSize = size === "host" ? 56 : 30;
  const pressedLike = state === "selected" || state === "locked" || state === "correct";

  const body = (
    <>
      <span className="nf nf-sm nq-answer__chip" aria-hidden="true">
        <AnswerSymbol kind={slot.symbol} size={symbolSize} />
      </span>
      <span className="nq-answer__letter font-numeral" aria-hidden="true">
        {slot.letter}
      </span>
      <span className="nq-answer__text">
        <span className="sr-only">{`${slot.letter}. `}</span>
        {text}
      </span>
      <span className="nq-answer__status">
        {state === "locked" && <Lock size={size === "host" ? 28 : 18} strokeWidth={2.75} aria-hidden="true" />}
        {state === "correct" && <Check size={size === "host" ? 32 : 20} strokeWidth={3.25} aria-hidden="true" />}
        {status}
        {typeof count === "number" && (
          <span className="nq-answer__count font-numeral tabular text-[1.6em] leading-none tracking-normal normal-case">
            {count}
          </span>
        )}
      </span>
      {typeof share === "number" && (
        <motion.span
          aria-hidden="true"
          className="nq-answer__bar"
          style={{ width: `calc(${Math.max(share, 0.02) * 100}% - 4px)` }}
          initial={reduce ? false : { scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.15 + order * 0.08 }}
        />
      )}
    </>
  );

  const shared = {
    "data-slot": position % 4,
    "data-state": state,
    "data-size": size,
    className: cn("nf nf-md nq-answer", className),
  };

  const entrance = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : {
        initial: { opacity: 0, x: size === "host" ? 48 : 24 },
        animate: { opacity: state === "dimmed" ? 0.36 : 1, x: 0 },
      };

  if (isStatic) {
    return (
      <motion.div
        {...shared}
        {...entrance}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: order * 0.07 }}
      >
        {body}
      </motion.div>
    );
  }

  return (
    <motion.button
      type="button"
      {...shared}
      {...entrance}
      disabled={disabled}
      aria-pressed={multi ? pressedLike : undefined}
      onClick={onSelect}
      whileTap={disabled || reduce ? undefined : { scale: 0.965, transition: { duration: 0.1 } }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: order * 0.05 }}
    >
      {body}
    </motion.button>
  );
}
