import type { ReactNode } from "react";
import Link from "next/link";
import { StageBackground } from "@/components/brand/StageBackground";
import { Wordmark } from "@/components/brand/Wordmark";
import { BinusLogo } from "@/components/brand/BinusLogo";

/**
 * Full-page stage for "something is off" moments (404, error boundaries). Strings
 * arrive translated, so the same markup serves server (not-found), client (error)
 * and the provider-less global-error document.
 */
export function StageFallback({
  glyph,
  ghost,
  eyebrow,
  title,
  body,
  actions,
  footnote,
}: {
  glyph: ReactNode;
  /** Giant background numeral, e.g. "404". Decorative. */
  ghost?: string;
  eyebrow?: string;
  title: string;
  body: string;
  actions: ReactNode;
  footnote?: ReactNode;
}) {
  return (
    <div className="stage isolate flex min-h-dvh flex-col">
      <StageBackground pattern="grid" intensity="soft" fade="center" />

      <header className="relative mx-auto flex w-full max-w-[1320px] items-center justify-between px-4 pt-5 sm:px-8 sm:pt-8">
        <Link href="/" className="rounded-sm">
          <Wordmark size="sm" />
        </Link>
        <BinusLogo height={28} />
      </header>

      <main className="relative mx-auto flex w-full max-w-[1320px] flex-1 items-center px-4 py-14 sm:px-8">
        {ghost && (
          <span
            aria-hidden="true"
            className="font-numeral pointer-events-none absolute right-2 bottom-4 text-[clamp(9rem,40vw,34rem)] leading-[0.8] text-kapas/[0.05] select-none sm:right-8"
          >
            {ghost}
          </span>
        )}
        <div className="relative max-w-[36rem]">
          <div className="nf nf-xl nf-panel grid size-28 place-items-center">{glyph}</div>
          {eyebrow && <p className="hud-label mt-8 text-stage-muted">{eyebrow}</p>}
          <h1 className="font-display-tight mt-3 text-[clamp(2.25rem,6vw,3.5rem)] leading-[1.02] text-balance text-kapas">
            {title}
          </h1>
          <p className="mt-4 max-w-[46ch] text-lg leading-relaxed text-pretty text-stage-muted">{body}</p>
          <div className="mt-10 flex flex-wrap gap-3">{actions}</div>
          {footnote}
        </div>
      </main>
    </div>
  );
}

const LOBE = "M24 22 C 18.6 19.4, 18.2 11.2, 24 6.4 C 29.8 11.2, 29.4 19.4, 24 22 Z";

/**
 * Kawung with a petal gone: "a piece of the page is missing". `loose` knocks the
 * fourth petal out of place instead (something broke), still built from the motif.
 */
export function KawungGap({ variant = "missing", size = 80 }: { variant?: "missing" | "loose"; size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" className="overflow-visible">
      <g fill="var(--binus-yellow)">
        <path d={LOBE} />
        <path d={LOBE} transform="rotate(180 24 24)" />
        <path d={LOBE} transform="rotate(270 24 24)" />
      </g>
      {variant === "missing" ? (
        <path
          d={LOBE}
          transform="rotate(90 24 24)"
          fill="none"
          stroke="var(--nusantara-white)"
          strokeOpacity="0.45"
          strokeWidth="1.4"
          strokeDasharray="2.4 2.2"
        />
      ) : (
        <path d={LOBE} transform="translate(9 7) rotate(118 24 24)" fill="var(--nusantara-white)" />
      )}
      <rect x="22.6" y="22.6" width="2.8" height="2.8" transform="rotate(45 24 24)" fill="var(--binus-yellow)" />
    </svg>
  );
}
