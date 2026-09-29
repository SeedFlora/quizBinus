"use client";

import type { Difficulty } from "@/lib/game/types";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";

const LEVEL: Record<Difficulty, number> = { mudah: 1, sedang: 2, sulit: 3 };

/** Three parang-slanted steps plus the word: the level reads by shape and label, not colour. */
export function DifficultyMeter({ difficulty, className }: { difficulty: Difficulty; className?: string }) {
  const t = useT();
  const level = LEVEL[difficulty];
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span aria-hidden="true" className="flex items-end gap-[3px]">
        {[1, 2, 3].map((step) => (
          <span
            key={step}
            className={cn("w-[7px] -skew-x-12 rounded-[1px]", step <= level ? "bg-desk-text" : "bg-desk-line")}
            style={{ height: 6 + step * 3 }}
          />
        ))}
      </span>
      <span className="text-sm font-semibold text-desk-text">{t(`creator.difficulty.${difficulty}`)}</span>
    </span>
  );
}
