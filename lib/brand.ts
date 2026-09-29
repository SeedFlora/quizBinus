/**
 * Product branding lives here so the working title can be swapped in one place.
 * Institutional (BINUS) assets are referenced through <BinusLogo />, never baked in.
 */
export const brand = {
  name: "NUSAQUEST",
  /** Split used by the wordmark: NUSA + QUEST get different weights. */
  nameParts: ["NUSA", "QUEST"] as const,
  descriptor: "A BINUS Learning Game Experience",
  tagline: "Play • Learn • Connect",
  institution: "BINUS University",
  /** Players are addressed as Binusians in host copy. */
  playerCollective: "Binusian",
  supportEmail: "nusaquest@example.ac.id",
  /** Replace with the official asset path once supplied by BINUS brand office. */
  logoSrc: process.env.NEXT_PUBLIC_BINUS_LOGO_SRC || "",
  themeColor: "#061433",
} as const;

export type Brand = typeof brand;
