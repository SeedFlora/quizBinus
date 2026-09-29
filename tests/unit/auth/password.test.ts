import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { dummyPasswordHash, hashPassword, temporaryPassword, verifyPassword } = await import("@/lib/auth/password");

describe("hashPassword / verifyPassword", () => {
  it("stores scrypt parameters, a salt and the key in a self-describing format", async () => {
    const hash = await hashPassword("rahasia-kelas-LA01");
    const parts = hash.split("$");
    expect(parts.slice(0, 4)).toEqual(["scrypt", "16384", "8", "1"]);
    expect(Buffer.from(parts[4]!, "base64")).toHaveLength(16);
    expect(Buffer.from(parts[5]!, "base64")).toHaveLength(64);
    expect(hash).not.toContain("rahasia");
  });

  it("verifies the right password and rejects others", async () => {
    const hash = await hashPassword("rahasia-kelas-LA01");
    await expect(verifyPassword("rahasia-kelas-LA01", hash)).resolves.toBe(true);
    await expect(verifyPassword("rahasia-kelas-LA02", hash)).resolves.toBe(false);
    await expect(verifyPassword("", hash)).resolves.toBe(false);
  });

  it("salts every hash", async () => {
    const [a, b] = await Promise.all([hashPassword("sama"), hashPassword("sama")]);
    expect(a).not.toBe(b);
    await expect(verifyPassword("sama", a)).resolves.toBe(true);
    await expect(verifyPassword("sama", b)).resolves.toBe(true);
  });

  it("treats Unicode-equivalent input as the same password (NFKC)", async () => {
    const hash = await hashPassword("ﬁsika"); // "fi" ligature
    await expect(verifyPassword("fisika", hash)).resolves.toBe(true);
  });

  it("never matches malformed or tampered hashes", async () => {
    const good = await hashPassword("x");
    const [, n, r, p, salt, key] = good.split("$");
    for (const bad of [
      "",
      "plaintext",
      `bcrypt$${n}$${r}$${p}$${salt}$${key}`,
      `scrypt$${n}$${r}$${p}$${salt}`,
      `scrypt$1000$${r}$${p}$${salt}$${key}`, // N not a power of two
      `scrypt$${2 ** 24}$${r}$${p}$${salt}$${key}`, // absurd cost
      `scrypt$${n}$${r}$${p}$$${key}`, // empty salt
    ]) {
      await expect(verifyPassword("x", bad)).resolves.toBe(false);
    }
  });

  it("verifies against lower-cost legacy parameters", async () => {
    // A hash written with N=1024 (e.g. by an older release) still verifies.
    const { scryptSync, randomBytes } = await import("node:crypto");
    const salt = randomBytes(16);
    const key = scryptSync("lama", salt, 64, { N: 1024, r: 8, p: 1 });
    const stored = `scrypt$1024$8$1$${salt.toString("base64")}$${key.toString("base64")}`;
    await expect(verifyPassword("lama", stored)).resolves.toBe(true);
  });

  it("offers a valid dummy hash for constant-time 'unknown email' checks", async () => {
    const dummy = await dummyPasswordHash();
    expect(dummy.startsWith("scrypt$16384$8$1$")).toBe(true);
    await expect(verifyPassword("anything", dummy)).resolves.toBe(false);
    expect(await dummyPasswordHash()).toBe(dummy);
  });
});

describe("temporaryPassword", () => {
  it("is 12 unambiguous characters in three groups", () => {
    for (let i = 0; i < 200; i++) {
      const pw = temporaryPassword();
      expect(pw).toMatch(/^[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}$/);
      expect(pw).not.toMatch(/[01oOlI]/);
    }
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 500 }, () => temporaryPassword()));
    expect(seen.size).toBe(500);
  });
});
