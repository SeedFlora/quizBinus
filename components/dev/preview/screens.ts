/**
 * Registry of fixture screens under /preview. Shared by the index (contact sheet)
 * and the dynamic route, so a screen is added in exactly one place.
 */

export type PreviewSurface = "player" | "host";

export type PreviewVariantKey = "stress" | "urgent" | "final" | "multiple" | "trueFalse" | "winner" | "noAnswer";

/** Query strings understood by the fixture builders (see fixtures.ts). */
export const VARIANT_QUERY: Record<PreviewVariantKey, string> = {
  stress: "stress=1",
  urgent: "t=4",
  final: "q=10",
  multiple: "q=9",
  trueFalse: "q=7",
  winner: "as=winner",
  noAnswer: "variant=none",
};

export const PREVIEW_SCREENS = [
  { id: "player-lobby", surface: "player", variants: ["stress"] },
  { id: "player-question", surface: "player", variants: ["urgent", "multiple", "trueFalse", "final"] },
  { id: "player-waiting", surface: "player", variants: ["multiple", "final"] },
  { id: "player-result-correct", surface: "player", variants: ["final"] },
  { id: "player-result-miss", surface: "player", variants: ["noAnswer", "multiple"] },
  { id: "player-final", surface: "player", variants: ["winner", "stress"] },
  { id: "host-lobby", surface: "host", variants: ["stress"] },
  { id: "host-intro", surface: "host", variants: ["final"] },
  { id: "host-question", surface: "host", variants: ["urgent", "multiple", "trueFalse"] },
  { id: "host-reveal", surface: "host", variants: ["multiple", "trueFalse", "final"] },
  { id: "host-leaderboard", surface: "host", variants: ["stress", "final"] },
  { id: "host-podium", surface: "host", variants: ["stress"] },
] as const satisfies ReadonlyArray<{ id: string; surface: PreviewSurface; variants: readonly PreviewVariantKey[] }>;

export type PreviewScreenId = (typeof PREVIEW_SCREENS)[number]["id"];

export function isPreviewScreen(value: string): value is PreviewScreenId {
  return PREVIEW_SCREENS.some((s) => s.id === value);
}

/** Native viewport each surface is designed for (used by the contact sheet). */
export const SURFACE_VIEWPORT: Record<PreviewSurface, { width: number; height: number }> = {
  player: { width: 390, height: 844 },
  host: { width: 1920, height: 1080 },
};
