/**
 * In-memory sliding-window limiter (lib/security/rate-limit.ts). Per-process only:
 * the game server runs as a single instance, so the limit is exact; with several
 * instances each would enforce it separately (docs/SCALING.md).
 */

export interface RateLimitRule {
  windowSeconds: number;
  max: number;
}

const SWEEP_EVERY = 5_000;

export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();
  private calls = 0;

  /** Records a hit and returns true when it is within the limit. */
  hit(key: string, rule: RateLimitRule, now = Date.now()): boolean {
    const windowMs = rule.windowSeconds * 1000;
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    const allowed = recent.length < rule.max;
    if (allowed) recent.push(now);
    this.hits.set(key, recent);
    if (++this.calls % SWEEP_EVERY === 0) this.sweep(now, windowMs);
    return allowed;
  }

  /** Drops keys with no hits inside the (longest seen) window so memory stays bounded. */
  private sweep(now: number, windowMs: number) {
    for (const [key, times] of this.hits) {
      if (times.every((t) => now - t >= Math.max(windowMs, 60_000))) this.hits.delete(key);
    }
  }

  reset() {
    this.hits.clear();
  }
}
