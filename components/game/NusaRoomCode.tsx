"use client";

import { forwardRef, useId, useState, type ChangeEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";
import { formatRoomCode, normalizeRoomInput, ROOM_CODE_LENGTH } from "@/lib/game/room-code";

/** Host display: the PIN as giant condensed numerals split 3 + 3. */
export function NusaRoomCodeDisplay({ code, className, label }: { code: string; className?: string; label: string }) {
  const reduce = useReducedMotion();
  const digits = code.split("");
  return (
    <div className={cn("flex flex-col", className)}>
      <span className="hud-label text-stage-muted">{label}</span>
      <p
        className="font-numeral mt-2 flex items-baseline leading-[0.8] text-kapas"
        aria-label={`${label}: ${formatRoomCode(code).split("").join(" ")}`}
      >
        {digits.map((d, i) => (
          <motion.span
            key={`${i}-${d}`}
            aria-hidden="true"
            className={cn(i === 3 && "ml-[0.18em]")}
            initial={reduce ? { opacity: 0 } : { y: "40%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 + i * 0.06, type: "spring", stiffness: 300, damping: 24 }}
          >
            {d}
          </motion.span>
        ))}
      </p>
    </div>
  );
}

/**
 * Player input: one real <input> (numeric keypad, paste-friendly, autofill-friendly)
 * drawn as six NUSA cells. The visible cells are decorative, and the input carries
 * the label and value for assistive tech.
 */
export const NusaRoomCodeInput = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (value: string) => void;
    label: string;
    hint?: string;
    error?: string;
    disabled?: boolean;
    autoFocus?: boolean;
    onComplete?: (value: string) => void;
  }
>(function NusaRoomCodeInput({ value, onChange, label, hint, error, disabled, autoFocus, onComplete }, ref) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const reduce = useReducedMotion();

  const handle = (e: ChangeEvent<HTMLInputElement>) => {
    const next = normalizeRoomInput(e.target.value);
    onChange(next);
    if (next.length === ROOM_CODE_LENGTH) onComplete?.(next);
  };

  return (
    <div className="w-full">
      <label htmlFor={id} className="hud-label mb-3 block text-stage-muted">
        {label}
      </label>
      <motion.div
        className="relative"
        animate={error && !reduce ? { x: [0, -6, 6, -5, 5, -2, 0] } : { x: 0 }}
        transition={{ duration: 0.36 }}
      >
        <input
          ref={ref}
          id={id}
          value={value}
          onChange={handle}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={ROOM_CODE_LENGTH}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-invalid={Boolean(error)}
          aria-describedby={`${id}-desc`}
          className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
        />
        {/* 3 + 3 grouping via a narrow spacer column, so six cells always fit 320px */}
        <div
          className="grid gap-1.5 sm:gap-2"
          style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr)) 4px repeat(3, minmax(0, 1fr))" }}
          aria-hidden="true"
        >
          {Array.from({ length: ROOM_CODE_LENGTH }, (_, i) => {
            const char = value[i];
            const active =
              focused && (i === value.length || (i === ROOM_CODE_LENGTH - 1 && value.length === ROOM_CODE_LENGTH));
            return (
              <div
                key={i}
                className={cn(
                  "nf nf-sm grid aspect-[4/5] place-items-center",
                  i === 3 && "col-start-5",
                  error
                    ? "nf-outline [--nf-stroke:var(--danger)]"
                    : active
                      ? "nf-outline [--nf-stroke:var(--binus-yellow)]"
                      : "nf-outline",
                )}
                style={{ ["--nf-stroke-w" as string]: active || error ? "2.5px" : "1.5px" }}
              >
                {char ? (
                  <motion.span
                    key={char + i}
                    className="font-numeral text-[clamp(2.25rem,11vw,3.5rem)] leading-none text-kapas"
                    initial={reduce ? false : { y: 10, opacity: 0, scale: 0.8 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    transition={{ type: "spring", stiffness: 700, damping: 30 }}
                  >
                    {char}
                  </motion.span>
                ) : (
                  <span className={cn("h-1 w-4 rounded-full", active ? "animate-pulse bg-sun" : "bg-kapas/20")} />
                )}
              </div>
            );
          })}
        </div>
      </motion.div>
      <p
        id={`${id}-desc`}
        className={cn("mt-3 text-sm", error ? "font-semibold text-[#ffb4ab]" : "text-stage-muted")}
        role={error ? "alert" : undefined}
      >
        {error ?? hint}
      </p>
    </div>
  );
});
