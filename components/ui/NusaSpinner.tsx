import { cn } from "@/lib/cn";

/** Loading glyph: a kawung that turns a quarter at a time (steps, not a smooth blur). */
export function NusaSpinner({ size = 20, className, label }: { size?: number; className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={cn("nq-spin shrink-0", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      fill="currentColor"
    >
      {[0, 90, 180, 270].map((deg, i) => (
        <path
          key={deg}
          d="M16 14.6 C 11.6 12.4, 11.2 5.6, 16 1.6 C 20.8 5.6, 20.4 12.4, 16 14.6 Z"
          transform={`rotate(${deg} 16 16)`}
          opacity={0.35 + i * 0.2}
        />
      ))}
      <style>{`.nq-spin{animation:nq-spin-steps 0.9s steps(4) infinite}@keyframes nq-spin-steps{to{transform:rotate(360deg)}}@media (prefers-reduced-motion: reduce){.nq-spin{animation-duration:2.4s}}`}</style>
    </svg>
  );
}
