/**
 * Failed sign-in throttling (in memory, per process: one container serves a campus).
 *
 *   per email + IP   5 failures / 15 min  stops password guessing against one account
 *                                         without locking the lecturer out from elsewhere
 *   per IP          30 failures / 15 min  stops spraying many accounts from one address
 *                                         (generous: a campus NAT is one address)
 *   per email       20 failures / 15 min  from ANY address. The client IP is only as
 *                                         trustworthy as X-Forwarded-For: reached directly
 *                                         (TRUST_PROXY off), a client picks its own and
 *                                         would otherwise get unlimited guesses. The price:
 *                                         someone guessing can hold up NEW sign-ins to that
 *                                         account for 15 min (existing sessions keep working).
 *
 * Only FAILURES count; a successful sign-in clears its email + IP bucket (not the
 * per-email one, or a guesser's count would reset whenever the lecturer signs in).
 */

export interface ThrottleRule {
  windowMs: number;
  max: number;
}

export const LOGIN_RULES = {
  account: { windowMs: 15 * 60 * 1000, max: 5 },
  ip: { windowMs: 15 * 60 * 1000, max: 30 },
  email: { windowMs: 15 * 60 * 1000, max: 20 },
} as const satisfies Record<string, ThrottleRule>;

const MAX_KEYS = 50_000;

export class FailureCounter {
  private failures = new Map<string, number[]>();

  constructor(private readonly rule: ThrottleRule) {}

  private recent(key: string, now: number): number[] {
    const kept = (this.failures.get(key) ?? []).filter((t) => now - t < this.rule.windowMs);
    if (kept.length) this.failures.set(key, kept);
    else this.failures.delete(key);
    return kept;
  }

  isBlocked(key: string, now = Date.now()): boolean {
    return this.recent(key, now).length >= this.rule.max;
  }

  record(key: string, now = Date.now()) {
    const list = this.recent(key, now);
    list.push(now);
    this.failures.set(key, list);
    if (this.failures.size > MAX_KEYS) this.sweep(now);
  }

  clear(key: string) {
    this.failures.delete(key);
  }

  private sweep(now: number) {
    for (const key of [...this.failures.keys()]) this.recent(key, now);
  }
}

export class LoginThrottle {
  private readonly account = new FailureCounter(LOGIN_RULES.account);
  private readonly ip = new FailureCounter(LOGIN_RULES.ip);
  private readonly email = new FailureCounter(LOGIN_RULES.email);

  private static accountKey(email: string, ip: string) {
    return `${email.toLowerCase()}|${ip}`;
  }

  isBlocked(email: string, ip: string, now = Date.now()): boolean {
    return (
      this.account.isBlocked(LoginThrottle.accountKey(email, ip), now) ||
      this.ip.isBlocked(ip, now) ||
      this.email.isBlocked(email.toLowerCase(), now)
    );
  }

  recordFailure(email: string, ip: string, now = Date.now()) {
    this.account.record(LoginThrottle.accountKey(email, ip), now);
    this.ip.record(ip, now);
    this.email.record(email.toLowerCase(), now);
  }

  recordSuccess(email: string, ip: string) {
    this.account.clear(LoginThrottle.accountKey(email, ip));
  }
}

const globalForThrottle = globalThis as unknown as { __nqLoginThrottle?: LoginThrottle };

/** Process-wide instance (survives dev hot reloads). */
export function getLoginThrottle(): LoginThrottle {
  globalForThrottle.__nqLoginThrottle ??= new LoginThrottle();
  return globalForThrottle.__nqLoginThrottle;
}
