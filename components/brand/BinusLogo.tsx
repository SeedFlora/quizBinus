/* eslint-disable @next/next/no-img-element -- external/replaceable brand asset with unknown dimensions */
import { brand } from "@/lib/brand";
import { cn } from "@/lib/cn";

/**
 * Replaceable institutional logo slot.
 *
 * We never redraw, recolour or distort the BINUS logo. Supply the official asset
 * by placing it in /public/brand/ and setting NEXT_PUBLIC_BINUS_LOGO_SRC
 * (e.g. "/brand/binus-logo.svg"). Until then a neutral text placeholder renders,
 * clearly marked with data-placeholder so it is easy to find before launch.
 */
export function BinusLogo({
  className,
  height = 28,
  tone = "light",
}: {
  className?: string;
  height?: number;
  /** "light" for navy stages, "dark" for the creator desk. */
  tone?: "light" | "dark";
}) {
  if (brand.logoSrc) {
    return (
      <img
        src={brand.logoSrc}
        alt={brand.institution}
        height={height}
        style={{ height, width: "auto" }}
        className={cn("block", className)}
      />
    );
  }
  return (
    <span
      data-placeholder="binus-logo"
      aria-label={brand.institution}
      role="img"
      className={cn(
        "inline-flex flex-col justify-center border-l-2 pl-2 leading-none font-extrabold tracking-[0.08em]",
        tone === "light" ? "border-kapas/40 text-kapas" : "border-ink/30 text-ink",
        className,
      )}
      style={{ height }}
    >
      <span style={{ fontSize: height * 0.42 }}>BINUS</span>
      <span style={{ fontSize: height * 0.24 }} className="font-semibold tracking-[0.2em] opacity-75">
        UNIVERSITY
      </span>
    </span>
  );
}
