import { describe, expect, it } from "vitest";
import { hashToken, randomToken, verifyToken } from "@/lib/security/token";
import { SlidingWindowLimiter } from "@/lib/security/sliding-window";
import { clientIp } from "@/lib/security/client-ip";

describe("player tokens", () => {
  it("are 256-bit url-safe secrets", () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(token);
  });

  it("verify against the stored sha256 only", () => {
    const token = randomToken();
    const stored = hashToken(token);
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    expect(stored).not.toContain(token);
    expect(verifyToken(token, stored)).toBe(true);
    expect(verifyToken(randomToken(), stored)).toBe(false);
    expect(verifyToken(token, "not-a-hash")).toBe(false);
    expect(verifyToken(token, null)).toBe(false);
  });
});

describe("SlidingWindowLimiter", () => {
  it("allows max hits per window, then recovers as the window slides", () => {
    const limiter = new SlidingWindowLimiter();
    const rule = { windowSeconds: 10, max: 5 };
    const t0 = 1_000_000;
    const results = Array.from({ length: 6 }, (_, i) => limiter.hit("answer:p1", rule, t0 + i));
    expect(results).toEqual([true, true, true, true, true, false]);
    expect(limiter.hit("answer:p2", rule, t0 + 6)).toBe(true); // keys are independent
    expect(limiter.hit("answer:p1", rule, t0 + 10_001)).toBe(true);
  });
});

describe("clientIp", () => {
  it("behind a trusted proxy (TRUST_PROXY=1): the first forwarded hop, then X-Real-IP", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }), true)).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }), true)).toBe("198.51.100.2");
    expect(clientIp(new Headers(), true)).toBe("unknown");
  });

  it("direct: the last hop (the socket address Next.js fills in), then X-Real-IP", () => {
    // A client-supplied first hop must not pick the bucket when no proxy vouches for it.
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 192.168.18.20" }))).toBe("192.168.18.20");
    expect(clientIp(new Headers({ "x-forwarded-for": "::ffff:192.168.18.20" }))).toBe("192.168.18.20");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });

  it("bounds the key length", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "x".repeat(500) })).length).toBe(64);
  });
});
