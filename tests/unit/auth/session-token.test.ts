import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  SESSION_COOKIE,
  SESSION_TOUCH_INTERVAL_MS,
  SESSION_TTL_MS,
  checkSession,
  cookieIsSecure,
  hashSessionToken,
  isWellFormedToken,
  newSessionToken,
  sessionCookieOptions,
  shouldTouch,
} = await import("@/lib/auth/session-token");

describe("session tokens", () => {
  it("are 256-bit url-safe secrets", () => {
    const token = newSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(isWellFormedToken(token)).toBe(true);
    expect(new Set(Array.from({ length: 200 }, newSessionToken)).size).toBe(200);
  });

  it("are stored as hex sha256 (known vectors), never as themselves", () => {
    expect(hashSessionToken("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(hashSessionToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const token = newSessionToken();
    const hash = hashSessionToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashSessionToken(token)).toBe(hash);
  });

  it("rejects malformed cookie values before any lookup", () => {
    for (const bad of [undefined, null, "", "short", `${"a".repeat(43)}=`, "a".repeat(44), `${"a".repeat(42)}/`]) {
      expect(isWellFormedToken(bad)).toBe(false);
    }
  });
});

describe("session cookie", () => {
  it("is called nq_session and lasts 14 days", () => {
    expect(SESSION_COOKIE).toBe("nq_session");
    const options = sessionCookieOptions(false);
    expect(options).toEqual({ httpOnly: true, sameSite: "lax", path: "/", secure: false, maxAge: 14 * 24 * 60 * 60 });
    expect(SESSION_TTL_MS).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it.each([
    ["true", null, true],
    ["true", "http", true],
    ["false", "https", false],
    ["auto", "https", true],
    ["auto", "HTTPS", true],
    ["auto", "https, http", true],
    ["auto", "http", false],
    ["auto", "http, https", false],
    ["auto", null, false],
  ] as const)("SESSION_COOKIE_SECURE=%s with X-Forwarded-Proto %j → Secure %s", (setting, proto, expected) => {
    expect(cookieIsSecure(setting, proto)).toBe(expected);
  });
});

describe("session validity", () => {
  const now = Date.UTC(2026, 8, 28, 8, 0, 0);

  it("is valid until expiry, for enabled accounts only", () => {
    expect(checkSession({ expiresAt: new Date(now + 1000) }, { disabled: false }, now)).toBe("valid");
    expect(checkSession({ expiresAt: new Date(now) }, { disabled: false }, now)).toBe("expired");
    expect(checkSession({ expiresAt: new Date(now - 1) }, { disabled: false }, now)).toBe("expired");
    expect(checkSession({ expiresAt: new Date(now + 1000) }, { disabled: true }, now)).toBe("disabled");
  });

  it("touches last_seen_at at most every 5 minutes", () => {
    expect(SESSION_TOUCH_INTERVAL_MS).toBe(5 * 60 * 1000);
    expect(shouldTouch(new Date(now - 60_000), now)).toBe(false);
    expect(shouldTouch(new Date(now - SESSION_TOUCH_INTERVAL_MS), now)).toBe(true);
    expect(shouldTouch(new Date(now - 60 * 60_000), now)).toBe(true);
  });
});
