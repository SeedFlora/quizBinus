"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Correct-answer burst: eight kawung petals fly out radially and a ring flares.
 * Short (≈700 ms), transform-only, and skipped entirely under reduced motion.
 */
export function KawungBurst({ size = 280, color = "var(--binus-yellow)" }: { size?: number; color?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  const petals = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ width: size, height: size }}
    >
      <motion.span
        className="absolute inset-0 rounded-full border-[6px]"
        style={{ borderColor: color }}
        initial={{ scale: 0.3, opacity: 0.9 }}
        animate={{ scale: 1.25, opacity: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      />
      {petals.map((deg, i) => (
        <motion.svg
          key={deg}
          viewBox="0 0 32 32"
          width={size * 0.16}
          height={size * 0.16}
          className="absolute top-1/2 left-1/2"
          style={{ marginLeft: -(size * 0.08), marginTop: -(size * 0.08), rotate: deg }}
          initial={{ x: 0, y: 0, scale: 0.2, opacity: 1 }}
          animate={{
            x: Math.cos(((deg - 90) * Math.PI) / 180) * size * 0.46,
            y: Math.sin(((deg - 90) * Math.PI) / 180) * size * 0.46,
            scale: 1,
            opacity: 0,
          }}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1], delay: i * 0.012 }}
        >
          <path d="M16 30 C 9 24, 9 10, 16 2 C 23 10, 23 24, 16 30 Z" fill={i % 2 ? "var(--nusantara-white)" : color} />
        </motion.svg>
      ))}
    </div>
  );
}
