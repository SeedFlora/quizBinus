import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * Three geometric pattern families abstracted from Indonesian textile structure.
 * They are reductions of an idea, not reproductions of specific artworks:
 *
 *  kawung → four pointed lobes around a centre on a 45° lattice
 *  flow   → parang's diagonal S-rhythm with a knot every other band
 *  grid   → tenun over/under interlace with a lozenge at each crossing
 *
 * Render at 3–10% opacity. They are texture, never content.
 */

export type PatternKind = "kawung" | "flow" | "grid";
export type PatternIntensity = "quiet" | "soft" | "loud";

const INTENSITY: Record<PatternIntensity, number> = {
  quiet: 0.04,
  soft: 0.07,
  loud: 0.1,
};

interface NusaPatternProps {
  kind: PatternKind;
  intensity?: PatternIntensity;
  /** Slow drift for waiting states. Disabled automatically for reduced motion. */
  drift?: boolean;
  /** Tile size in px. */
  scale?: number;
  className?: string;
  /** Radial mask so the pattern fades toward the centre (keeps content legible). */
  fade?: "none" | "center" | "edges" | "bottom";
}

const MASKS: Record<NonNullable<NusaPatternProps["fade"]>, string | undefined> = {
  none: undefined,
  center: "radial-gradient(70% 70% at 50% 50%, transparent 20%, black 80%)",
  edges: "radial-gradient(80% 80% at 50% 50%, black 30%, transparent 85%)",
  bottom: "linear-gradient(to bottom, transparent 10%, black 90%)",
};

export function NusaPattern({
  kind,
  intensity = "soft",
  drift = false,
  scale,
  className,
  fade = "none",
}: NusaPatternProps) {
  const id = useId().replace(/:/g, "");
  const mask = MASKS[fade];
  return (
    <div
      aria-hidden="true"
      className={cn("pattern-layer", className)}
      data-drift={drift ? "true" : undefined}
      style={{
        opacity: INTENSITY[intensity],
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
    >
      <svg xmlns="http://www.w3.org/2000/svg">
        <defs>
          <PatternDef kind={kind} id={id} scale={scale} />
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
      </svg>
    </div>
  );
}

export function PatternDef({ kind, id, scale }: { kind: PatternKind; id: string; scale?: number }) {
  if (kind === "kawung") return <KawungTile id={id} size={scale ?? 56} />;
  if (kind === "flow") return <FlowTile id={id} size={scale ?? 64} />;
  return <GridTile id={id} size={scale ?? 40} />;
}

/** Four lobes around a centre point; quarter-dots at tile corners stitch the lattice. */
function KawungTile({ id, size }: { id: string; size: number }) {
  return (
    <pattern id={id} width={size} height={size} patternUnits="userSpaceOnUse" viewBox="0 0 56 56">
      {/* Plump ovals (the palm fruit), not pointed leaves: pointed lobes read as "×" at small sizes. */}
      <g fill="none" stroke="currentColor" strokeWidth="1.6">
        <ellipse cx="35.5" cy="20.5" rx="9" ry="5.4" transform="rotate(-45 35.5 20.5)" />
        <ellipse cx="35.5" cy="35.5" rx="9" ry="5.4" transform="rotate(45 35.5 35.5)" />
        <ellipse cx="20.5" cy="35.5" rx="9" ry="5.4" transform="rotate(-45 20.5 35.5)" />
        <ellipse cx="20.5" cy="20.5" rx="9" ry="5.4" transform="rotate(45 20.5 20.5)" />
      </g>
      <g fill="currentColor">
        <circle cx="0" cy="0" r="3" />
        <circle cx="56" cy="0" r="3" />
        <circle cx="0" cy="56" r="3" />
        <circle cx="56" cy="56" r="3" />
        <rect x="26" y="26" width="4" height="4" transform="rotate(45 28 28)" />
      </g>
    </pattern>
  );
}

/** Parang rhythm: diagonal S-bands; a small knot on alternate bands. */
function FlowTile({ id, size }: { id: string; size: number }) {
  return (
    <pattern
      id={id}
      width={size}
      height={size}
      patternUnits="userSpaceOnUse"
      viewBox="0 0 64 64"
      patternTransform="rotate(-45)"
    >
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M0 16 C 10 6, 22 6, 32 16 S 54 26, 64 16" />
        <path d="M0 48 C 10 38, 22 38, 32 48 S 54 58, 64 48" strokeOpacity="0.6" />
      </g>
      <path d="M32 29 l3 3 l-3 3 l-3 -3 Z" fill="currentColor" />
    </pattern>
  );
}

/** Tenun interlace: threads alternate over/under; lozenge at the tile centre. */
function GridTile({ id, size }: { id: string; size: number }) {
  return (
    <pattern id={id} width={size} height={size} patternUnits="userSpaceOnUse" viewBox="0 0 40 40">
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
        {/* horizontal thread at y=10: over at x=10, under at x=30 */}
        <path d="M0 10 H 26 M34 10 H 40" />
        {/* vertical thread at x=10: under at y=10, over at y=30 */}
        <path d="M10 0 V 6 M10 14 V 40" />
        {/* horizontal thread at y=30: under at x=10, over at x=30 */}
        <path d="M0 30 H 6 M14 30 H 40" />
        {/* vertical thread at x=30: over at y=10, under at y=30 */}
        <path d="M30 0 V 26 M30 34 V 40" />
      </g>
      <path d="M20 16.5 L23.5 20 L20 23.5 L16.5 20 Z" fill="currentColor" />
    </pattern>
  );
}
