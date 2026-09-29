import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

/** Installable PWA (optional: the game never requires installation). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${brand.name}: ${brand.descriptor}`,
    short_name: brand.name,
    description: "Quiz interaktif real-time untuk pengalaman belajar BINUS yang lebih hidup.",
    start_url: "/join",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: brand.themeColor,
    theme_color: brand.themeColor,
    lang: "id",
    categories: ["education", "games"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      // Placeholders: replace with exported PNGs before launch (see README → Branding).
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
