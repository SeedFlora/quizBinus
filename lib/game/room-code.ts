/**
 * Human-friendly 6-digit room PINs.
 * - cryptographically random (not sequential, not derived from ids)
 * - never starts with 0 (people drop leading zeros when reading aloud)
 * - rejects visually "guessable" PINs: repeats, runs, and short cycles
 */

export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_PATTERN = /^[1-9]\d{5}$/;
/** Rooms stop accepting joins after this long, even if the host forgets to end. */
export const ROOM_CODE_TTL_MS = 4 * 60 * 60 * 1000;

export function isValidRoomCode(value: string): boolean {
  return ROOM_CODE_PATTERN.test(value);
}

export function isGuessable(code: string): boolean {
  const digits = code.split("").map(Number);
  if (new Set(digits).size <= 2) return true; // 111111, 121212, 112211
  const steps = digits.slice(1).map((d, i) => d - digits[i]!);
  if (steps.every((s) => s === 1) || steps.every((s) => s === -1)) return true; // 123456, 987654
  if (code.slice(0, 3) === code.slice(3)) return true; // 385385
  return false;
}

function randomDigits(): string {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  // 900000 possible codes, 100000..999999 (bias from modulo is negligible for 2^32)
  return String(100000 + (buf[0]! % 900000));
}

/**
 * @param isTaken - collision check against currently active sessions.
 */
export async function generateRoomCode(isTaken: (code: string) => boolean | Promise<boolean> = () => false) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const code = randomDigits();
    if (isGuessable(code)) continue;
    if (await isTaken(code)) continue;
    return code;
  }
  throw new Error("Could not allocate a room code");
}

/** Normalize user input: keeps digits only, max 6. */
export function normalizeRoomInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, ROOM_CODE_LENGTH);
}

/** "482913" → "482 913" for display. */
export function formatRoomCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}
