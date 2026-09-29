"use client";

import { useEffect, useRef } from "react";
import { animate, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";

const format = (n: number) => Math.round(n).toLocaleString("id-ID");

/** Count-up hook writing straight to the DOM node (no per-frame React renders). */
export function useCountUp(value: number, { from = 0, duration = 0.9, delay = 0 } = {}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduce) {
      node.textContent = format(value);
      return;
    }
    const controls = animate(from, value, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        node.textContent = format(v);
      },
    });
    return () => controls.stop();
  }, [value, from, duration, delay, reduce]);
  return ref;
}

/**
 * Tabular score that counts up. `delta` renders the signature "+850" punch.
 */
export function NusaScore({
  value,
  from = 0,
  delay = 0,
  prefix,
  suffix,
  className,
  label,
}: {
  value: number;
  from?: number;
  delay?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  /** Accessible full value, e.g. "Total skor 8.420". */
  label?: string;
}) {
  const ref = useCountUp(value, { from, delay });
  return (
    <span
      className={cn("font-numeral tabular inline-flex items-baseline", className)}
      aria-label={label ?? `${prefix ?? ""}${format(value)}${suffix ?? ""}`}
    >
      {/* flex trims edge whitespace, so spaces in affixes become non-breaking */}
      {prefix && <span aria-hidden="true">{prefix.replace(/ /g, " ")}</span>}
      <span ref={ref} aria-hidden="true">
        {format(from)}
      </span>
      {suffix && <span aria-hidden="true">{suffix.replace(/ /g, " ")}</span>}
    </span>
  );
}
