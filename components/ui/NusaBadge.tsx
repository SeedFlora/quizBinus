import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type NusaBadgeTone =
  "neutral" | "energy" | "sun" | "sky" | "success" | "celebrate" | "miss" | "desk" | "desk-primary";

const TONES: Record<NusaBadgeTone, string> = {
  neutral: "bg-kapas/10 text-kapas",
  energy: "bg-energy text-[#1d0d00]",
  sun: "bg-sun text-binus-950",
  sky: "bg-sky text-binus-950",
  success: "bg-success text-binus-950",
  celebrate: "bg-merah text-kapas",
  miss: "bg-miss/25 text-kapas",
  desk: "bg-desk-sunken text-desk-muted",
  "desk-primary": "bg-binus-500/10 text-binus-500",
};

/**
 * Notched capsule: a pill whose trailing end is cut on the diagonal, echoing the
 * NUSA FRAME cut. Used for status, HUD chips and achievement labels.
 */
export function NusaBadge({
  tone = "neutral",
  size = "md",
  icon,
  className,
  children,
}: {
  tone?: NusaBadgeTone;
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-extrabold whitespace-nowrap",
        size === "sm" && "h-6 pr-3 pl-2 text-[11px] tracking-wide",
        size === "md" && "h-8 pr-4 pl-3 text-xs tracking-wide",
        size === "lg" && "h-11 pr-6 pl-4 text-base",
        TONES[tone],
        className,
      )}
      style={{
        borderRadius: "999px 4px 4px 999px",
        clipPath: "polygon(0 0, 100% 0, calc(100% - 0.55em) 100%, 0 100%)",
      }}
    >
      {icon}
      {children}
    </span>
  );
}
