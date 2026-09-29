import { brand } from "@/lib/brand";
import { cn } from "@/lib/cn";

/**
 * Product mark: a small NUSA FRAME tile holding a kawung, the shape and the
 * culture in one glyph. Used as favicon, PWA icon and in the wordmark.
 */
export function ProductMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={cn("shrink-0", className)} aria-hidden="true">
      <path d="M8 2 H36 L46 12 V34 Q46 46 34 46 H8 V41 H2 V8 Q2 2 8 2 Z" fill="var(--binus-orange)" />
      <g fill="var(--binus-blue-950)">
        {[0, 90, 180, 270].map((deg) => (
          <path
            key={deg}
            d="M24 22 C 18.6 19.4, 18.2 11.2, 24 6.4 C 29.8 11.2, 29.4 19.4, 24 22 Z"
            transform={`rotate(${deg} 24 24)`}
          />
        ))}
      </g>
    </svg>
  );
}

export function Wordmark({
  className,
  size = "md",
  withMark = true,
  tone = "light",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  withMark?: boolean;
  tone?: "light" | "dark";
}) {
  const [a, b] = brand.nameParts;
  const text = size === "lg" ? "text-4xl" : size === "sm" ? "text-lg" : "text-2xl";
  const mark = size === "lg" ? 44 : size === "sm" ? 24 : 32;
  return (
    <span
      className={cn("inline-flex items-center gap-2.5", tone === "light" ? "text-kapas" : "text-ink", className)}
      aria-label={brand.name}
      role="img"
    >
      {withMark && <ProductMark size={mark} />}
      <span className={cn("leading-none", text)} aria-hidden="true">
        <span className="font-display-wide">{a}</span>
        <span className="font-numeral text-energy">{b}</span>
      </span>
    </span>
  );
}
