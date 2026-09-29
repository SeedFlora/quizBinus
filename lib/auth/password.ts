import "server-only";
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Lecturer password hashing with Node's built-in scrypt (no native modules, so the
 * Docker image stays slim). Stored format, self-describing so parameters can be
 * raised later without invalidating existing hashes:
 *
 *   scrypt$16384$8$1$<salt base64>$<hash base64>
 */

const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
/** Upper bound on accepted cost so a tampered hash cannot pin the CPU. */
const MAX_N = 1 << 20;

function derive(password: string, salt: Buffer, options: ScryptOptions, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // maxmem: 128 * N * r bytes plus headroom; Node's 32 MB default rejects larger N.
    const maxmem = 256 * (options.N ?? N) * (options.r ?? R);
    scrypt(password.normalize("NFKC"), salt, keyLength, { ...options, maxmem }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await derive(plain, salt, { N, r: R, p: P }, KEY_LENGTH);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

interface ParsedHash {
  n: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

function parse(stored: string): ParsedHash | null {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [n, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (![n, r, p].every(Number.isSafeInteger)) return null;
  // N must be a power of two > 1 (scrypt requirement); r and p small positive ints.
  if (n < 2 || n > MAX_N || (n & (n - 1)) !== 0 || r < 1 || r > 32 || p < 1 || p > 16) return null;
  const salt = Buffer.from(parts[4]!, "base64");
  const hash = Buffer.from(parts[5]!, "base64");
  if (salt.length < 8 || hash.length < 16) return null;
  return { n, r, p, salt, hash };
}

/** Constant-time check of `plain` against a stored hash. Malformed hashes never match. */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed) return false;
  try {
    const actual = await derive(plain, parsed.salt, { N: parsed.n, r: parsed.r, p: parsed.p }, parsed.hash.length);
    return actual.length === parsed.hash.length && timingSafeEqual(actual, parsed.hash);
  } catch {
    return false;
  }
}

/**
 * A valid hash of a random secret. Sign-in verifies against it when the email is
 * unknown, so "no such account" costs the same time as "wrong password".
 */
let dummyHash: Promise<string> | null = null;
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(18).toString("base64"));
  return dummyHash;
}

/** Readable one-time password for new or reset accounts: no 0/O, 1/l/I. */
export function temporaryPassword(length = 12): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  // Rejection sampling: only bytes below the largest multiple of the alphabet size, so
  // every character is equally likely.
  const limit = 256 - (256 % alphabet.length);
  let out = "";
  while (out.length < length) {
    for (const b of randomBytes(length * 2)) {
      if (b < limit && out.length < length) out += alphabet[b % alphabet.length];
    }
  }
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`;
}

/** Policy for passwords a person chooses (and ADMIN_PASSWORD). */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 256;
