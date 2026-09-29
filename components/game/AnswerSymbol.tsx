import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * Answer identity symbols. Each answer is COLOR + SYMBOL + LETTER + POSITION,
 * so the game is fully playable without colour perception.
 *
 *   A  Kawung   four petals around a centre (palm-fruit cross-section)
 *   B  Parang   paired diagonal blades (speed / direction)
 *   C  Mega     layered cloud, abstracted from Cirebon's mega mendung
 *   D  Bintang  eight-point star with a woven centre
 *
 * Silhouettes were chosen to be mutually distinct at 12px, and so that none of
 * them resembles a Latin letter or a UI icon (×, ⚠, ▶).
 */

export type AnswerSymbolKind = "kawung" | "parang" | "mega" | "bintang";

export const ANSWER_SLOTS = [
  { letter: "A", symbol: "kawung", name: "Kawung", color: "var(--ans-a)", ink: "var(--ans-a-ink)" },
  { letter: "B", symbol: "parang", name: "Parang", color: "var(--ans-b)", ink: "var(--ans-b-ink)" },
  { letter: "C", symbol: "mega", name: "Mega", color: "var(--ans-c)", ink: "var(--ans-c-ink)" },
  { letter: "D", symbol: "bintang", name: "Bintang", color: "var(--ans-d)", ink: "var(--ans-d-ink)" },
] as const satisfies ReadonlyArray<{
  letter: string;
  symbol: AnswerSymbolKind;
  name: string;
  color: string;
  ink: string;
}>;

export function answerSlot(position: number) {
  return ANSWER_SLOTS[((position % 4) + 4) % 4]!;
}

const STAR_POINTS = Array.from({ length: 16 }, (_, i) => {
  const r = i % 2 === 0 ? 13.5 : 7.6;
  const a = ((-90 + i * 22.5) * Math.PI) / 180;
  return `${(16 + r * Math.cos(a)).toFixed(2)} ${(16 + r * Math.sin(a)).toFixed(2)}`;
}).join(" L ");

/** Kawung petal pointing up; rotated ×4 into a "+" (never reads as an "×"). */
const LOBE = "M16 14.6 C 11.6 12.4, 11.2 5.6, 16 1.6 C 20.8 5.6, 20.4 12.4, 16 14.6 Z";

/** Three-lobed cloud; nested copies (ring + core) give the mega mendung gradation. */
const CLOUD =
  "M7.6 26.4 C 3.2 26.4, 1.8 20.4, 6 18.6 C 5.4 12.8, 11.8 9.8, 15.4 13.4 C 17.4 7.4, 26.8 7.6, 26.6 15 C 31.4 15.6, 31.6 26.4, 25.4 26.4 Z";

export function AnswerSymbol({
  kind,
  size = 28,
  className,
  title,
}: {
  kind: AnswerSymbolKind;
  size?: number;
  className?: string;
  /** Provide when the symbol stands alone; omit when a visible letter/label is adjacent. */
  title?: string;
}) {
  const maskId = `mega-${useId().replace(/:/g, "")}`;
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      fill="currentColor"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {kind === "kawung" && (
        <g>
          <path d={LOBE} />
          <path d={LOBE} transform="rotate(90 16 16)" />
          <path d={LOBE} transform="rotate(180 16 16)" />
          <path d={LOBE} transform="rotate(270 16 16)" />
        </g>
      )}
      {kind === "parang" && (
        <g>
          <path d="M3.5 27 L13.5 5 H19 L9 27 Z" />
          <path d="M13 27 L23 5 H28.5 L18.5 27 Z" />
        </g>
      )}
      {kind === "mega" && (
        <>
          <mask id={maskId}>
            <path d={CLOUD} fill="white" />
            <path d={CLOUD} fill="black" transform="translate(16 19.4) scale(0.64) translate(-16 -19.4)" />
            <path d={CLOUD} fill="white" transform="translate(16 20) scale(0.36) translate(-16 -20)" />
          </mask>
          <rect width="32" height="32" mask={`url(#${maskId})`} />
        </>
      )}
      {kind === "bintang" && <path fillRule="evenodd" d={`M ${STAR_POINTS} Z M16 13 L19 16 L16 19 L13 16 Z`} />}
    </svg>
  );
}
