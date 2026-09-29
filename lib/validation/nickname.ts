/**
 * Nickname hygiene. Nicknames are projected in front of a whole class, so they are
 * sanitized (no markup, no control chars), length-limited, and checked against a
 * small blocklist. Lecturers can still kick anything that slips through.
 */

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 20;

// Deliberately short: catches the obvious cases without mangling real names.
// Matching is done on a normalized, leetspeak-folded form.
const BLOCKLIST = [
  "anjing",
  "bangsat",
  "babi",
  "kontol",
  "memek",
  "ngentot",
  "jancok",
  "jancuk",
  "goblok",
  "tolol",
  "bajingan",
  "pepek",
  "asu",
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "nigger",
  "nigga",
  "admin",
  "host",
  "dosen",
];

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

function fold(value: string) {
  return value
    .toLowerCase()
    .replace(/[013457@$]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z]/g, "");
}

export type NicknameResult = { ok: true; value: string } | { ok: false; reason: "invalid" | "blocked" };

/** Returns a safe display string, or a reason it can't be used. */
export function sanitizeNickname(raw: string): NicknameResult {
  const cleaned = raw
    .normalize("NFKC")
    // strip tags and anything that could open markup
    .replace(/<[^>]*>/g, "")
    .replace(/[<>"'`\\{}]/g, "")
    // control chars, zero-width and bidi overrides
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Allow letters (any script), numbers, spaces and a few friendly separators.
  if (!/^[\p{L}\p{N} ._\-']+$/u.test(cleaned)) return { ok: false, reason: "invalid" };
  const length = [...cleaned].length;
  if (length < NICKNAME_MIN || length > NICKNAME_MAX) return { ok: false, reason: "invalid" };

  const folded = fold(cleaned);
  const tokens = cleaned
    .toLowerCase()
    .split(/[\s._\-']+/)
    .map(fold);
  const blocked = BLOCKLIST.some((word) =>
    // short words must match a whole token to avoid false positives (e.g. "Asuka")
    word.length <= 4 ? tokens.includes(word) : folded.includes(word),
  );
  if (blocked) return { ok: false, reason: "blocked" };

  return { ok: true, value: cleaned };
}

/** Case-insensitive uniqueness key within a session. */
export function nicknameKey(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}
