import "server-only";
import { SlidingWindowLimiter, type RateLimitRule } from "./sliding-window";

export type { RateLimitRule } from "./sliding-window";

/**
 * Limits for the public (unauthenticated) surface and the host API. Generous enough
 * for a whole class behind one campus NAT address, tight enough to stop PIN
 * enumeration and spam. The game server is a single process by design, so an
 * in-memory sliding window is exact (docs/SCALING.md covers multi-instance setups).
 */
export const RATE_LIMITS = {
  /** GET /api/rooms/[code], per IP. */
  lookup: { windowSeconds: 60, max: 30 },
  /**
   * Lookups and joins of a PIN with no live room, whole server: bounds PIN enumeration
   * even with spoofed IPs. Hits never count, so a flood of guesses cannot lock out
   * students who type a real PIN.
   */
  roomMisses: { windowSeconds: 60, max: 3000 },
  /** POST /api/rooms/[code]/join, per IP. */
  join: { windowSeconds: 60, max: 10 },
  /** POST /api/rooms/[code]/join, per room (a full class of 300 plus retries), so spam aimed at one room spares the others. */
  joinPerRoom: { windowSeconds: 60, max: 600 },
  /** POST /api/sessions/[id]/answer, per player. One answer per question plus retries. */
  answer: { windowSeconds: 10, max: 5 },
  /** POST /api/sessions/[id]/player, per player (resume, snapshot polling while offline, summary). */
  player: { windowSeconds: 60, max: 60 },
  /** POST /api/sessions/[id]/events, per player or host (reconnect storms). */
  events: { windowSeconds: 60, max: 30 },
  /** POST /api/sessions, per lecturer (per IP in memory mode). */
  createSession: { windowSeconds: 60, max: 10 },
  /** POST /api/sessions/[id]/host, per lecturer. */
  host: { windowSeconds: 10, max: 40 },
  /** POST /api/demo/host, per IP. */
  demo: { windowSeconds: 60, max: 20 },
  /** POST /api/media, per lecturer. */
  media: { windowSeconds: 60, max: 30 },
  /** POST/PUT/DELETE /api/quizzes, per lecturer (autosave included). */
  quizWrite: { windowSeconds: 60, max: 60 },
} satisfies Record<string, RateLimitRule>;

const globalForLimiter = globalThis as unknown as { __nqRateLimiter?: SlidingWindowLimiter };

/** One limiter per process (survives dev hot reloads, like the game runtime). */
function limiter(): SlidingWindowLimiter {
  globalForLimiter.__nqRateLimiter ??= new SlidingWindowLimiter();
  return globalForLimiter.__nqRateLimiter;
}

/** Records one hit for `key` and returns true when the caller may proceed. */
export function rateLimit(key: string, rule: RateLimitRule): boolean {
  return limiter().hit(key, rule);
}

/** Tests only: forget every recorded hit. */
export function resetRateLimits() {
  limiter().reset();
}
