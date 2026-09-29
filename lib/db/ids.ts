import { createHash } from "node:crypto";

/**
 * Deterministic RFC 9562 version-8 uuid: the first 128 bits of
 * sha256("nusaquest:" + key) with the version/variant bits stamped.
 *
 * Maps readable ids (seed quizzes such as "os-battle", editor draft ids) to the
 * uuid columns stably, so a retried save of the same draft updates one row
 * instead of creating two, and importing the seeds twice is a no-op.
 */
export function stableUuid(key: string): string {
  const hex = createHash("sha256").update(`nusaquest:${key}`, "utf8").digest("hex").slice(0, 32);
  const variant = ((parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16);
  const h = `${hex.slice(0, 12)}8${hex.slice(13, 16)}${variant}${hex.slice(17, 32)}`;
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
