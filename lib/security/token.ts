import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Player bearer tokens. The raw token is returned to the player exactly once (join)
 * and kept in their localStorage; the database only ever stores sha256(token).
 */

/** 256-bit url-safe secret. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export const hashToken = sha256Hex;

const HEX_SHA256 = /^[0-9a-f]{64}$/i;

/** Constant-time comparison of a presented token against a stored hash. */
export function verifyToken(token: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !HEX_SHA256.test(storedHash)) return false;
  const expected = Buffer.from(storedHash, "hex");
  const actual = Buffer.from(sha256Hex(token), "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
