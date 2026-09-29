/**
 * NUSAQUEST scoring model — kept transparent so lecturers can explain it to students.
 *
 * For a standard 1000-point question in CLASSIC mode:
 *
 *   correct answer      700 pts   (always, no matter how slow)
 *   speed bonus       0–300 pts   (full bonus inside the grace window, then linear to 0)
 *   streak bonus      +50 per consecutive correct after the first, capped at +250
 *
 * Maximum before streak = 1000. A correct answer at the last second still earns 700,
 * so slow-but-right students are never punished heavily.
 *
 * Questions worth 0 / 500 / 2000 / custom points scale the base + speed parts
 * proportionally. Streak bonus is unscaled (but disabled for 0-point questions).
 */

import type { GameMode } from "./types";

export interface ScoringProfile {
  /** Share of question points granted for correctness alone. */
  baseShare: number;
  /** Share of question points available as speed bonus. */
  speedShare: number;
  /** Fraction of the time limit that still earns the full speed bonus. */
  graceRatio: number;
  streakStep: number;
  streakCap: number;
}

export const SCORING_PROFILES: Record<GameMode, ScoringProfile> = {
  classic: { baseShare: 0.7, speedShare: 0.3, graceRatio: 0.1, streakStep: 50, streakCap: 250 },
  team: { baseShare: 0.7, speedShare: 0.3, graceRatio: 0.1, streakStep: 50, streakCap: 250 },
  // Accuracy over speed: speed is only a small tiebreaker.
  mastery: { baseShare: 0.9, speedShare: 0.1, graceRatio: 0.25, streakStep: 25, streakCap: 100 },
  practice: { baseShare: 1, speedShare: 0, graceRatio: 1, streakStep: 0, streakCap: 0 },
};

export const STANDARD_POINTS = 1000;

export interface ScoreInput {
  isCorrect: boolean;
  /** 0..1 partial credit (multiple-choice). Defaults to 1 when correct, 0 otherwise. */
  credit?: number;
  responseTimeMs: number;
  timeLimitMs: number;
  questionPoints: number;
  /** Consecutive correct answers BEFORE this one. */
  streakBefore: number;
  mode?: GameMode;
}

export interface ScoreBreakdown {
  base: number;
  speed: number;
  streak: number;
  total: number;
  streakAfter: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** 1 inside the grace window, then linear down to 0 at the time limit. */
export function speedFactor(responseTimeMs: number, timeLimitMs: number, graceRatio: number): number {
  if (timeLimitMs <= 0) return 0;
  const t = clamp(responseTimeMs, 0, timeLimitMs);
  const grace = timeLimitMs * clamp(graceRatio, 0, 1);
  if (t <= grace) return 1;
  const window = timeLimitMs - grace;
  if (window <= 0) return 1;
  return clamp(1 - (t - grace) / window, 0, 1);
}

export function streakBonus(streakAfter: number, profile: ScoringProfile): number {
  if (streakAfter < 2) return 0;
  return Math.min((streakAfter - 1) * profile.streakStep, profile.streakCap);
}

export function calculateScore(input: ScoreInput): ScoreBreakdown {
  const profile = SCORING_PROFILES[input.mode ?? "classic"];
  const credit = clamp(input.credit ?? (input.isCorrect ? 1 : 0), 0, 1);
  const points = Math.max(0, input.questionPoints);

  if (credit === 0 || points === 0) {
    // Zero-point questions (warm-ups, polls) don't affect streaks either way,
    // except that a wrong answer on a scored question resets the streak.
    const streakAfter = points === 0 ? input.streakBefore : 0;
    return { base: 0, speed: 0, streak: 0, total: 0, streakAfter };
  }

  const base = Math.round(points * profile.baseShare * credit);
  const speed = Math.round(
    points * profile.speedShare * credit * speedFactor(input.responseTimeMs, input.timeLimitMs, profile.graceRatio),
  );

  // Partial credit keeps the answer "not fully correct": streak only grows on a full hit.
  const streakAfter = input.isCorrect ? input.streakBefore + 1 : 0;
  const streak = input.isCorrect ? streakBonus(streakAfter, profile) : 0;

  return { base, speed, streak, total: base + speed + streak, streakAfter };
}

/** Human-readable explanation used in the creator settings panel and the README. */
export function describeScoring(mode: GameMode = "classic", points = STANDARD_POINTS) {
  const p = SCORING_PROFILES[mode];
  return {
    base: Math.round(points * p.baseShare),
    speedMax: Math.round(points * p.speedShare),
    gracePercent: Math.round(p.graceRatio * 100),
    streakStep: p.streakStep,
    streakCap: p.streakCap,
  };
}
