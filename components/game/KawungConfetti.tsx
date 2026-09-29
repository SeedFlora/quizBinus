"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import { seededRandom } from "@/lib/random";

/**
 * Celebration particles made from the product's motifs: kawung petals, tenun
 * lozenges and parang blades, in yellow/orange/sky with red + white accents.
 * ~48 transform-only particles; no canvas, no physics engine.
 */
const SHAPES = [
  "M16 30 C 9 24, 9 10, 16 2 C 23 10, 23 24, 16 30 Z", // kawung petal
  "M16 2 L30 16 L16 30 L2 16 Z", // lozenge
  "M6 30 L18 2 H26 L14 30 Z", // parang blade
];
const COLORS = ["#FFC82E", "#F7861F", "#46B8F4", "#E0262F", "#FFF9EE", "#FFC82E"];

export function KawungConfetti({
  count = 48,
  seed = 7,
  className,
}: {
  count?: number;
  seed?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const particles = useMemo(() => {
    const rand = seededRandom(seed);
    return Array.from({ length: count }, (_, i) => ({
      i,
      x: rand() * 100,
      size: 14 + rand() * 22,
      delay: rand() * 1.6,
      duration: 3.2 + rand() * 2.6,
      drift: (rand() - 0.5) * 18,
      spin: (rand() > 0.5 ? 1 : -1) * (180 + rand() * 540),
      shape: SHAPES[i % SHAPES.length]!,
      color: COLORS[Math.floor(rand() * COLORS.length)]!,
    }));
  }, [count, seed]);

  if (reduce) return null;
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className ?? ""}`}>
      {particles.map((p) => (
        <motion.svg
          key={p.i}
          viewBox="0 0 32 32"
          width={p.size}
          height={p.size}
          className="absolute top-0"
          style={{ left: `${p.x}%` }}
          initial={{ y: "-10vh", x: 0, rotate: 0, opacity: 0 }}
          animate={{ y: "110vh", x: `${p.drift}vw`, rotate: p.spin, opacity: [0, 1, 1, 0.8] }}
          transition={{ duration: p.duration, delay: p.delay, ease: "easeIn", repeat: Infinity, repeatDelay: 0.4 }}
        >
          <path d={p.shape} fill={p.color} />
        </motion.svg>
      ))}
    </div>
  );
}
