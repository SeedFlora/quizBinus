import type { Locale } from "@/lib/i18n/config";

/**
 * Number formatting for analytics, shared by the page and the CSV export so a
 * figure reads the same on screen and in the spreadsheet. Indonesian uses a
 * decimal comma ("8,8 detik"), English a decimal point.
 */

const tag = (locale: Locale) => (locale === "id" ? "id-ID" : "en-US");

/** 0.678 → 68 (whole percent, rounded half up). */
export function toPercent(ratio: number): number {
  return Math.round(ratio * 100);
}

/** 0.678 → "68%"; null → "–". */
export function formatPercent(ratio: number | null): string {
  return ratio === null ? "–" : `${toPercent(ratio)}%`;
}

/** 8832 ms → "8,8" (id) / "8.8" (en). One decimal: enough to compare questions, not noisy. */
export function formatSeconds(ms: number | null, locale: Locale): string {
  if (ms === null) return "–";
  return new Intl.NumberFormat(tag(locale), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(ms / 1000);
}

/** 11521 → "11.521" (id) / "11,521" (en). */
export function formatInteger(value: number, locale: Locale): string {
  return new Intl.NumberFormat(tag(locale), { maximumFractionDigits: 0 }).format(value);
}

/** Zero-padded question or rank numeral used as a visual anchor: 4 → "04". */
export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Answer letter for a slot beyond the four symbol identities (ordering can have six). */
export function slotLetter(slot: number): string {
  return String.fromCharCode(65 + slot);
}

/** [1, 2, 3, 5, 7, 8] → "1–3, 5, 7, 8": question numbers as a lecturer would write them. */
export function formatNumberList(numbers: number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i]!;
    let end = start;
    while (sorted[i + 1] === end + 1) end = sorted[++i]!;
    parts.push(end === start ? String(start) : end === start + 1 ? `${start}, ${end}` : `${start}–${end}`);
  }
  return parts.join(", ");
}
