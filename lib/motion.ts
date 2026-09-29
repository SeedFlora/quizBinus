import type { Transition } from "motion/react";

/**
 * Motion tokens. Every animated component picks one category so timing feels
 * consistent across player, host and creator. See docs/DESIGN.md §6.
 */

export const ease = {
  outExpo: [0.16, 1, 0.3, 1] as const,
  inOutQuint: [0.83, 0, 0.17, 1] as const,
  outBack: [0.34, 1.56, 0.64, 1] as const,
};

export const duration = {
  micro: 0.14,
  system: 0.28,
  game: 0.6,
  celebration: 1.2,
} as const;

export const transition = {
  micro: { type: "spring", stiffness: 700, damping: 32, mass: 0.6 } satisfies Transition,
  system: { duration: duration.system, ease: ease.outExpo } satisfies Transition,
  game: { duration: duration.game, ease: ease.inOutQuint } satisfies Transition,
  gameSpring: { type: "spring", stiffness: 260, damping: 26 } satisfies Transition,
  celebration: { type: "spring", stiffness: 180, damping: 14 } satisfies Transition,
  /** Leaderboard reorder: physical but settles fast so rows stay readable. */
  layout: { type: "spring", stiffness: 320, damping: 34 } satisfies Transition,
};

/** Reduced-motion replacement: short opacity-only fade. */
export const reducedTransition: Transition = { duration: 0.12, ease: "linear" };

export const stagger = {
  list: 0.045,
  podium: 0.45,
  answers: 0.06,
};

/** Wrong-answer shake: controlled, three cycles, never humiliating. */
export const shakeKeyframes = { x: [0, -6, 6, -5, 5, -2, 0] };
export const shakeTransition: Transition = { duration: 0.36, ease: "easeInOut" };

/** Answer-lock squash & rebound. */
export const lockKeyframes = { scale: [1, 0.96, 1.02, 1] };
export const lockTransition: Transition = { duration: 0.32, times: [0, 0.3, 0.7, 1], ease: "easeOut" };
