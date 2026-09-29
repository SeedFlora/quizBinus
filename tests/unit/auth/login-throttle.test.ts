import { describe, expect, it } from "vitest";
import { LOGIN_RULES, LoginThrottle } from "@/lib/auth/login-throttle";

const T0 = Date.UTC(2026, 8, 28, 1, 0, 0);
const MIN = 60_000;

describe("LoginThrottle", () => {
  it("blocks an email + IP after 5 failures within 15 minutes", () => {
    const throttle = new LoginThrottle();
    for (let i = 0; i < LOGIN_RULES.account.max; i++) {
      expect(throttle.isBlocked("laras@binus.edu", "10.0.0.7", T0 + i)).toBe(false);
      throttle.recordFailure("laras@binus.edu", "10.0.0.7", T0 + i);
    }
    expect(throttle.isBlocked("laras@binus.edu", "10.0.0.7", T0 + MIN)).toBe(true);
    // Case-insensitive on the email.
    expect(throttle.isBlocked("LARAS@binus.edu", "10.0.0.7", T0 + MIN)).toBe(true);
    // The same lecturer from another address, and other accounts, are unaffected.
    expect(throttle.isBlocked("laras@binus.edu", "10.0.0.8", T0 + MIN)).toBe(false);
    expect(throttle.isBlocked("budi@binus.edu", "10.0.0.7", T0 + MIN)).toBe(false);
  });

  it("forgets failures once they leave the window", () => {
    const throttle = new LoginThrottle();
    for (let i = 0; i < 5; i++) throttle.recordFailure("a@b.id", "1.1.1.1", T0);
    expect(throttle.isBlocked("a@b.id", "1.1.1.1", T0 + 14 * MIN)).toBe(true);
    expect(throttle.isBlocked("a@b.id", "1.1.1.1", T0 + 15 * MIN)).toBe(false);
  });

  it("clears the account bucket on a successful sign-in", () => {
    const throttle = new LoginThrottle();
    for (let i = 0; i < 4; i++) throttle.recordFailure("a@b.id", "1.1.1.1", T0);
    throttle.recordSuccess("a@b.id", "1.1.1.1");
    throttle.recordFailure("a@b.id", "1.1.1.1", T0);
    expect(throttle.isBlocked("a@b.id", "1.1.1.1", T0)).toBe(false);
  });

  it("caps failures per IP across many emails (password spraying)", () => {
    const throttle = new LoginThrottle();
    for (let i = 0; i < LOGIN_RULES.ip.max; i++) throttle.recordFailure(`user${i}@binus.edu`, "10.9.9.9", T0);
    expect(throttle.isBlocked("fresh@binus.edu", "10.9.9.9", T0)).toBe(true);
    expect(throttle.isBlocked("fresh@binus.edu", "10.9.9.10", T0)).toBe(false);
  });
});
