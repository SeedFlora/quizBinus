import type { ReactNode } from "react";
import { StageBackground, type StageTone } from "@/components/brand/StageBackground";
import type { PatternKind } from "@/components/brand/NusaPattern";
import { cn } from "@/lib/cn";

/**
 * Phone-controller frame: full dynamic viewport height, one column capped at a
 * phone width even on desktop, safe-area aware. Every player screen renders inside.
 */
export function PlayerShell({
  children,
  pattern,
  tone = "default",
  drift,
  className,
  header,
}: {
  children: ReactNode;
  pattern?: PatternKind;
  tone?: StageTone;
  drift?: boolean;
  className?: string;
  header?: ReactNode;
}) {
  return (
    <div className="stage isolate flex min-h-dvh flex-col">
      <StageBackground pattern={pattern} tone={tone} drift={drift} intensity={pattern === "grid" ? "soft" : "quiet"} />
      <div
        className={cn(
          "relative mx-auto flex w-full max-w-[480px] flex-1 flex-col px-4 pt-[max(16px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))]",
          className,
        )}
      >
        {header}
        {children}
      </div>
    </div>
  );
}
