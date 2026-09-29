import { describe, expect, it } from "vitest";
import {
  calculateScore,
  describeScoring,
  SCORING_PROFILES,
  speedFactor,
  STANDARD_POINTS,
  streakBonus,
  type ScoreInput,
} from "@/lib/game/scoring";

const LIMIT = 20_000; // 20 s question; classic grace window = 2 s

const score = (overrides: Partial<ScoreInput> = {}) =>
  calculateScore({
    isCorrect: true,
    responseTimeMs: 0,
    timeLimitMs: LIMIT,
    questionPoints: STANDARD_POINTS,
    streakBefore: 0,
    ...overrides,
  });

describe("calculateScore: classic 1000-point question", () => {
  it("awards 700 base + 300 speed for an instant correct answer", () => {
    expect(score()).toEqual({ base: 700, speed: 300, streak: 0, total: 1000, streakAfter: 1 });
  });

  it("keeps the full speed bonus inside the 10% grace window", () => {
    expect(score({ responseTimeMs: 1_999 }).speed).toBe(300);
    expect(score({ responseTimeMs: 2_000 }).speed).toBe(300);
    // 1 ms past grace still rounds to 300; 100 ms past grace is visibly less
    expect(score({ responseTimeMs: 2_100 }).speed).toBe(298);
  });

  it("drains the speed bonus linearly after the grace window", () => {
    // halfway through the 18 s window after grace → factor 0.5
    expect(score({ responseTimeMs: 11_000 })).toMatchObject({ base: 700, speed: 150, total: 850 });
    expect(score({ responseTimeMs: 15_500 }).speed).toBe(75);
  });

  it("still pays 700 for a correct answer at the very last moment", () => {
    expect(score({ responseTimeMs: LIMIT })).toMatchObject({ base: 700, speed: 0, total: 700 });
  });

  it("never drops a slow correct answer below 700 (network-late answers are clamped)", () => {
    expect(score({ responseTimeMs: LIMIT * 5 }).total).toBe(700);
  });

  it("never exceeds 1000 before the streak bonus, at any response time", () => {
    for (let t = -500; t <= LIMIT + 1_000; t += 250) {
      const s = score({ responseTimeMs: t });
      expect(s.base + s.speed).toBeLessThanOrEqual(1000);
      expect(s.base + s.speed).toBeGreaterThanOrEqual(700);
      expect(s.total).toBe(s.base + s.speed);
    }
  });

  it("gives nothing for a wrong answer and resets the streak", () => {
    expect(score({ isCorrect: false, streakBefore: 4 })).toEqual({
      base: 0,
      speed: 0,
      streak: 0,
      total: 0,
      streakAfter: 0,
    });
  });
});

describe("calculateScore: streak bonus", () => {
  it("starts at the second consecutive correct answer (+50 per step)", () => {
    expect(score({ streakBefore: 0 }).streak).toBe(0);
    expect(score({ streakBefore: 1 })).toMatchObject({ streak: 50, streakAfter: 2, total: 1050 });
    expect(score({ streakBefore: 2 }).streak).toBe(100);
    expect(score({ streakBefore: 4 }).streak).toBe(200);
  });

  it("caps the bonus at +250", () => {
    expect(score({ streakBefore: 5 }).streak).toBe(250);
    expect(score({ streakBefore: 6 }).streak).toBe(250);
    expect(score({ streakBefore: 30 })).toMatchObject({ streak: 250, streakAfter: 31, total: 1250 });
  });

  it("is not scaled with question points", () => {
    expect(score({ questionPoints: 2000, streakBefore: 1 }).streak).toBe(50);
    expect(score({ questionPoints: 500, streakBefore: 1 }).streak).toBe(50);
  });

  it("streakBonus helper follows the profile", () => {
    expect(streakBonus(1, SCORING_PROFILES.classic)).toBe(0);
    expect(streakBonus(3, SCORING_PROFILES.classic)).toBe(100);
    expect(streakBonus(99, SCORING_PROFILES.mastery)).toBe(100);
    expect(streakBonus(99, SCORING_PROFILES.practice)).toBe(0);
  });
});

describe("calculateScore: point presets", () => {
  it("scales base and speed for 2000-point (×2) questions", () => {
    expect(score({ questionPoints: 2000 })).toMatchObject({ base: 1400, speed: 600, total: 2000 });
    expect(score({ questionPoints: 2000, responseTimeMs: LIMIT }).total).toBe(1400);
  });

  it("scales base and speed for 500-point questions", () => {
    expect(score({ questionPoints: 500 })).toMatchObject({ base: 350, speed: 150, total: 500 });
  });

  it("zero-point questions award nothing and leave the streak untouched either way", () => {
    expect(score({ questionPoints: 0, streakBefore: 3 })).toEqual({
      base: 0,
      speed: 0,
      streak: 0,
      total: 0,
      streakAfter: 3,
    });
    expect(score({ questionPoints: 0, isCorrect: false, streakBefore: 3 }).streakAfter).toBe(3);
  });

  it("treats negative points as zero", () => {
    expect(score({ questionPoints: -100, streakBefore: 2 })).toMatchObject({ total: 0, streakAfter: 2 });
  });
});

describe("calculateScore: partial credit", () => {
  it("scales base and speed by credit but does not grow the streak", () => {
    const half = score({ isCorrect: false, credit: 0.5, streakBefore: 3 });
    expect(half).toEqual({ base: 350, speed: 150, streak: 0, total: 500, streakAfter: 0 });
  });

  it("clamps credit into 0..1", () => {
    expect(score({ credit: 3 }).total).toBe(1000);
    expect(score({ isCorrect: false, credit: -1 }).total).toBe(0);
  });

  it("zero credit on a scored question breaks the streak", () => {
    expect(score({ isCorrect: false, credit: 0, streakBefore: 5 }).streakAfter).toBe(0);
  });
});

describe("calculateScore: game mode profiles", () => {
  it("mastery favours accuracy: 900 base, 100 speed, wider grace, smaller streak", () => {
    expect(score({ mode: "mastery" })).toMatchObject({ base: 900, speed: 100, total: 1000 });
    // 25% grace of 20 s = 5 s still earns the full bonus
    expect(score({ mode: "mastery", responseTimeMs: 5_000 }).speed).toBe(100);
    expect(score({ mode: "mastery", responseTimeMs: LIMIT }).total).toBe(900);
    expect(score({ mode: "mastery", streakBefore: 1 }).streak).toBe(25);
    expect(score({ mode: "mastery", streakBefore: 20 }).streak).toBe(100);
  });

  it("practice pays a flat 1000 with no speed or streak bonus", () => {
    expect(score({ mode: "practice", responseTimeMs: 19_000, streakBefore: 9 })).toEqual({
      base: 1000,
      speed: 0,
      streak: 0,
      total: 1000,
      streakAfter: 10,
    });
  });

  it("team mode scores like classic", () => {
    expect(score({ mode: "team", responseTimeMs: 11_000, streakBefore: 1 })).toEqual(
      score({ mode: "classic", responseTimeMs: 11_000, streakBefore: 1 }),
    );
  });
});

describe("speedFactor", () => {
  it("returns 0 for a zero or negative time limit", () => {
    expect(speedFactor(0, 0, 0.1)).toBe(0);
    expect(speedFactor(100, -5, 0.1)).toBe(0);
  });

  it("returns 1 when the whole limit is grace", () => {
    expect(speedFactor(19_999, LIMIT, 1)).toBe(1);
  });

  it("clamps out-of-range response times", () => {
    expect(speedFactor(-1_000, LIMIT, 0.1)).toBe(1);
    expect(speedFactor(LIMIT * 2, LIMIT, 0.1)).toBe(0);
  });
});

describe("describeScoring", () => {
  it("explains the classic model in lecturer terms", () => {
    expect(describeScoring()).toEqual({ base: 700, speedMax: 300, gracePercent: 10, streakStep: 50, streakCap: 250 });
  });

  it("scales with question points", () => {
    expect(describeScoring("classic", 2000)).toMatchObject({ base: 1400, speedMax: 600 });
    expect(describeScoring("mastery")).toMatchObject({ base: 900, speedMax: 100, gracePercent: 25 });
  });
});
