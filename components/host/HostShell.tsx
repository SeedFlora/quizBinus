"use client";

import type { ReactNode } from "react";
import { StageBackground, type StageTone } from "@/components/brand/StageBackground";
import type { PatternKind } from "@/components/brand/NusaPattern";
import { cn } from "@/lib/cn";

/**
 * Projector canvas: exactly one viewport, never scrolls. Sizing uses viewport
 * units with clamps so the same layout reads on a 1080p projector, a 4K TV and a
 * 4:3 classroom beamer (see the `host-43` rules in each view).
 */
export function HostShell({
  children,
  pattern,
  tone,
  drift,
  intensity,
  className,
}: {
  children: ReactNode;
  pattern?: PatternKind;
  tone?: StageTone;
  drift?: boolean;
  intensity?: "quiet" | "soft" | "loud";
  className?: string;
}) {
  return (
    <div className="stage host-canvas isolate">
      <StageBackground
        pattern={pattern}
        tone={tone}
        drift={drift}
        intensity={intensity}
        fade={pattern ? "center" : "none"}
      />
      <div className={cn("relative flex h-full w-full flex-col p-[var(--host-safe)]", className)}>{children}</div>
    </div>
  );
}
