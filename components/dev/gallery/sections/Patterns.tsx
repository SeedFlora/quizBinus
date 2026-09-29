"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { NusaPattern, PatternDef, type PatternIntensity, type PatternKind } from "@/components/brand/NusaPattern";
import { KawungBurst } from "@/components/game/KawungBurst";
import { KawungConfetti } from "@/components/game/KawungConfetti";
import { NusaButton } from "@/components/ui/NusaButton";
import { useT } from "@/lib/i18n/client";
import { ReplayButton, Specimen, useReplay } from "../primitives";

const KINDS: Array<{ kind: PatternKind; name: string }> = [
  { kind: "kawung", name: "NusaKawung" },
  { kind: "flow", name: "NusaFlow" },
  { kind: "grid", name: "NusaGrid" },
];
const LEVELS: Array<{ intensity: PatternIntensity; pct: string }> = [
  { intensity: "quiet", pct: "4%" },
  { intensity: "soft", pct: "7%" },
  { intensity: "loud", pct: "10%" },
];

export function PatternsSection() {
  const t = useT();
  return (
    <div className="grid gap-10">
      {KINDS.map(({ kind, name }) => (
        <div key={kind} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LEVELS.map(({ intensity, pct }) => (
            <Specimen key={intensity} label={`${name} · ${t(`design.labels.${intensity}`)} ${pct}`}>
              <div className="nf nf-md nf-outline relative h-40 w-full overflow-hidden">
                <NusaPattern kind={kind} intensity={intensity} className="nf-clip" />
              </div>
            </Specimen>
          ))}
          {/* Construction view: the tile at full strength, so the geometry can be judged. */}
          <Specimen label={`${name} · ${t("design.labels.construction")}`}>
            <div className="nf nf-md nf-panel relative h-40 w-full overflow-hidden text-sun">
              <svg className="nf-clip absolute inset-0 h-full w-full opacity-70" aria-hidden="true">
                <defs>
                  <PatternDef kind={kind} id={`construction-${kind}`} scale={kind === "grid" ? 48 : 72} />
                </defs>
                <rect width="100%" height="100%" fill={`url(#construction-${kind})`} />
              </svg>
            </div>
          </Specimen>
        </div>
      ))}
    </div>
  );
}

export function CelebrationSection() {
  const t = useT();
  const burst = useReplay();
  const [confetti, setConfetti] = useState(false);
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Specimen label={t("design.labels.burst")}>
        <div className="nf nf-lg nf-outline relative grid h-72 w-full place-items-center overflow-hidden">
          <div key={burst.run} className="relative grid size-20 place-items-center">
            <KawungBurst size={260} />
            <span className="font-numeral relative text-5xl text-sun uppercase">{t("result.correct")}</span>
          </div>
          <ReplayButton onClick={burst.replay} className="absolute right-4 bottom-4" />
        </div>
      </Specimen>
      <Specimen label={t("design.labels.confetti")}>
        <div className="nf nf-lg nf-outline relative h-72 w-full overflow-hidden">
          {confetti && <KawungConfetti count={40} seed={11} />}
          <NusaButton
            variant={confetti ? "sun" : "ghost"}
            size="sm"
            aria-pressed={confetti}
            icon={<Sparkles size={16} aria-hidden="true" />}
            onClick={() => setConfetti((c) => !c)}
            className="absolute right-4 bottom-4"
          >
            {confetti ? t("design.hide") : t("design.show")}
          </NusaButton>
        </div>
      </Specimen>
    </div>
  );
}
