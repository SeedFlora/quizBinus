import { cn } from "@/lib/cn";
import { NusaPattern, type PatternIntensity, type PatternKind } from "./NusaPattern";

export type StageTone = "default" | "focus" | "celebrate" | "miss";

/**
 * Procedural background stack: base → radial light → grain → pattern → vignette.
 * Sits behind content (absolute, pointer-events none). Pure CSS/SVG, no rasters.
 */
export function StageBackground({
  pattern,
  intensity = "soft",
  drift = false,
  tone = "default",
  fade = "none",
  vignette = true,
  className,
}: {
  pattern?: PatternKind;
  intensity?: PatternIntensity;
  drift?: boolean;
  tone?: StageTone;
  fade?: "none" | "center" | "edges" | "bottom";
  vignette?: boolean;
  className?: string;
}) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 -z-10", className)}>
      <div className="stage-light" data-tone={tone === "default" ? undefined : tone} />
      {pattern && <NusaPattern kind={pattern} intensity={intensity} drift={drift} fade={fade} />}
      <div className="stage-grain" />
      {vignette && <div className="stage-vignette" />}
    </div>
  );
}
