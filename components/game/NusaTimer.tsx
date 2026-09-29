"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Pause } from "lucide-react";
import { cn } from "@/lib/cn";
import { useCountdown, type CountdownOptions } from "@/lib/game/use-countdown";
import { useT } from "@/lib/i18n/client";
import { getAudio } from "@/lib/audio/engine";

const URGENT_AT = 5;

/**
 * Countdown ring + numerals. Urgency in the final five seconds is carried by
 * SHAPE (ring breaks into five segments, one drops per second), SCALE (numeral
 * punches on each tick) and TEXT (live region) as well as colour.
 */
export function NusaTimer({
  totalSeconds,
  size = "player",
  sound = false,
  className,
  ...countdown
}: CountdownOptions & {
  totalSeconds: number;
  size?: "player" | "host" | "mini";
  /** Play the countdown tick in the urgent window (host screen only). */
  sound?: boolean;
  className?: string;
}) {
  const t = useT();
  const reduce = useReducedMotion();
  const { seconds, remainingRef } = useCountdown(countdown);
  const ringRef = useRef<SVGCircleElement>(null);
  const urgent = !countdown.paused && seconds > 0 && seconds <= URGENT_AT;

  const px = size === "host" ? 220 : size === "mini" ? 56 : 88;
  const stroke = size === "host" ? 14 : size === "mini" ? 5 : 8;
  const r = 50 - stroke / 2 - 1;
  const circumference = 2 * Math.PI * r;

  // Smooth ring drain on rAF, no React re-render per frame.
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const total = Math.max(1, totalSeconds * 1000);
      const progress = Math.min(1, Math.max(0, remainingRef.current / total));
      if (ringRef.current) ringRef.current.style.strokeDashoffset = String(circumference * (1 - progress));
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [circumference, remainingRef, totalSeconds]);

  useEffect(() => {
    if (sound && urgent) void getAudio().play("countdown");
  }, [seconds, sound, urgent]);

  const numeral = size === "host" ? "text-[112px]" : size === "mini" ? "text-2xl" : "text-5xl";

  return (
    <div
      className={cn("relative grid shrink-0 place-items-center", className)}
      style={{ width: px, height: px }}
      role="timer"
      aria-label={t("host.timer")}
    >
      <svg viewBox="0 0 100 100" width={px} height={px} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--stage-line)" strokeWidth={stroke} />
        {urgent ? (
          // five segments; one disappears per remaining second
          Array.from({ length: URGENT_AT }, (_, i) => {
            const seg = circumference / URGENT_AT;
            const visible = i < seconds;
            return (
              <circle
                key={i}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke="var(--binus-yellow)"
                strokeWidth={stroke}
                strokeDasharray={`${seg - 3} ${circumference - seg + 3}`}
                strokeDashoffset={-i * seg}
                style={{ opacity: visible ? 1 : 0, transition: "opacity 200ms" }}
              />
            );
          })
        ) : (
          <circle
            ref={ringRef}
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={countdown.paused ? "var(--state-miss)" : "var(--binus-sky)"}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
          />
        )}
      </svg>

      {urgent && !reduce && size !== "mini" && (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full border-2 border-sun"
          style={{ animation: "nq-pulse-ring 1s ease-out infinite" }}
        />
      )}

      <AnimatePresence mode="popLayout" initial={false}>
        {countdown.paused ? (
          <motion.span key="paused" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-miss">
            <Pause size={size === "host" ? 72 : 28} aria-label={t("play.paused")} />
          </motion.span>
        ) : (
          <motion.span
            key={seconds}
            className={cn("font-numeral relative leading-none", numeral, urgent ? "text-sun" : "text-kapas")}
            initial={reduce ? { opacity: 0 } : urgent ? { scale: 1.45, opacity: 0 } : { y: "-30%", opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { y: "30%", opacity: 0 }}
            transition={urgent ? { type: "spring", stiffness: 500, damping: 18 } : { duration: 0.18 }}
          >
            {String(seconds).padStart(2, "0")}
          </motion.span>
        )}
      </AnimatePresence>

      {/* Polite announcements only at meaningful moments, not every second. */}
      <span className="sr-only" aria-live="polite">
        {seconds === 10 || seconds === URGENT_AT ? t("play.timeLeft", { seconds }) : ""}
      </span>
    </div>
  );
}
