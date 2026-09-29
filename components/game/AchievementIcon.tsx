import type { AchievementId } from "@/lib/game/types";
import { cn } from "@/lib/cn";

/**
 * Achievement family. Every badge sits in the same bintang-octagon frame (an
 * eight-point textile star softened into a medallion), with a glyph built from the
 * product's motifs: parang blades, kawung petals, tumpal steps, tenun lozenges.
 */

const FRAME = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? 30 : 26.5;
    const a = ((-90 + i * 22.5) * Math.PI) / 180;
    pts.push(`${(32 + r * Math.cos(a)).toFixed(2)},${(32 + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
})();

const PETAL = "M32 31 C 28.5 28.5, 28.2 22, 32 18 C 35.8 22, 35.5 28.5, 32 31 Z";

const GLYPHS: Record<AchievementId, React.ReactNode> = {
  // Fast answer: two parang blades with a speed trail
  fast: (
    <g>
      <path d="M19 44 L29 20 H35 L25 44 Z" />
      <path d="M29 44 L39 20 H45 L35 44 Z" />
      <path
        d="M14 26 H22 M12 32 H20 M14 38 H20"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.6"
      />
    </g>
  ),
  // Perfect round: complete four-petal kawung
  perfect: (
    <g>
      {[0, 90, 180, 270].map((d) => (
        <path key={d} d={PETAL} transform={`rotate(${d} 32 32)`} />
      ))}
      <circle cx="32" cy="32" r="3" />
    </g>
  ),
  // Comeback: tumpal steps rising
  comeback: (
    <g>
      <path d="M16 44 H24 V36 H32 V28 H40 V20 H48 V44 Z" opacity="0.35" />
      <path
        d="M20 40 L44 18 M44 18 H34 M44 18 V28"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </g>
  ),
  // Hot streak: stacked blades like a flame
  streak: (
    <g>
      <path d="M22 46 L32 30 H38 L28 46 Z" />
      <path d="M26 36 L34 22 H39 L31 36 Z" opacity="0.8" />
      <path d="M30 27 L36 16 H40 L34 27 Z" opacity="0.6" />
    </g>
  ),
  // Top three: three podium bars
  top3: (
    <g>
      <rect x="15" y="30" width="10" height="16" rx="1.5" />
      <rect x="27" y="20" width="10" height="26" rx="1.5" />
      <rect x="39" y="34" width="10" height="12" rx="1.5" />
    </g>
  ),
  // First place: bintang with a crest
  first: (
    <g>
      <path d="M32 14 L36 26 L48 26 L38.5 33.5 L42 46 L32 38.5 L22 46 L25.5 33.5 L16 26 L28 26 Z" />
    </g>
  ),
  // Accuracy master: tenun lozenge target
  accuracy: (
    <g fill="none" stroke="currentColor" strokeWidth="3.5">
      <path d="M32 14 L50 32 L32 50 L14 32 Z" />
      <path d="M32 23 L41 32 L32 41 L23 32 Z" />
      <path d="M32 29.5 L34.5 32 L32 34.5 L29.5 32 Z" fill="currentColor" stroke="none" />
    </g>
  ),
};

const TONES: Record<AchievementId, { fill: string; ink: string }> = {
  fast: { fill: "var(--binus-sky)", ink: "var(--binus-blue-950)" },
  perfect: { fill: "var(--binus-yellow)", ink: "var(--binus-blue-950)" },
  comeback: { fill: "var(--binus-orange)", ink: "#1d0d00" },
  streak: { fill: "var(--nusantara-red)", ink: "var(--nusantara-white)" },
  top3: { fill: "var(--nusantara-white)", ink: "var(--binus-blue-950)" },
  first: { fill: "var(--binus-yellow)", ink: "var(--nusantara-red)" },
  accuracy: { fill: "var(--binus-blue-500)", ink: "var(--nusantara-white)" },
};

export function AchievementIcon({
  id,
  size = 56,
  earned = true,
  className,
}: {
  id: AchievementId;
  size?: number;
  earned?: boolean;
  className?: string;
}) {
  const tone = TONES[id];
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={cn("shrink-0", className)} aria-hidden="true">
      <polygon points={FRAME} fill={earned ? tone.fill : "rgb(255 249 238 / 0.08)"} />
      <polygon
        points={FRAME}
        fill="none"
        stroke={earned ? tone.ink : "rgb(255 249 238 / 0.25)"}
        strokeOpacity="0.25"
        strokeWidth="1.5"
        transform="translate(32 32) scale(0.84) translate(-32 -32)"
      />
      <g fill="currentColor" style={{ color: earned ? tone.ink : "rgb(255 249 238 / 0.35)" }}>
        {GLYPHS[id]}
      </g>
    </svg>
  );
}
