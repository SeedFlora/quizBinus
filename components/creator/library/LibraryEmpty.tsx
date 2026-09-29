"use client";

import { Plus, Sparkles } from "lucide-react";
import { AnswerSymbol, ANSWER_SLOTS } from "@/components/game/AnswerSymbol";
import { NusaLink } from "@/components/ui/NusaButton";
import { useT } from "@/lib/i18n/client";

/** No arenas yet: an empty arena drawn in the product's own geometry, waiting to be filled. */
export function LibraryEmpty() {
  const t = useT();
  return (
    <section
      aria-labelledby="library-empty-title"
      className="grid items-center gap-x-16 gap-y-10 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:py-16"
    >
      <EmptyArena />
      <div>
        <h2
          id="library-empty-title"
          className="font-display-tight max-w-[18ch] text-[clamp(2rem,3.4vw,2.75rem)] leading-[1.02] text-desk-text"
        >
          {t("creator.emptyQuizzes")}
        </h2>
        <p className="mt-4 max-w-[44ch] text-[17px] leading-relaxed text-desk-muted">
          {t("creator.library.emptyBody")}
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <NusaLink href="/quizzes/new" variant="energy" size="lg" icon={<Plus size={20} aria-hidden="true" />}>
            {t("creator.emptyQuizzesCta")}
          </NusaLink>
          <NusaLink href="/quizzes/new?mode=ai" variant="desk-quiet" icon={<Sparkles size={18} aria-hidden="true" />}>
            {t("creator.generateAi")}
          </NusaLink>
        </div>
      </div>
    </section>
  );
}

/**
 * A NUSA FRAME drawn as a dashed outline (the arena not yet built) holding four
 * empty answer rails, each keyed by its symbol. Pure geometry, no illustration.
 */
function EmptyArena() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-[420px]">
      <svg viewBox="0 0 420 300" className="block h-auto w-full text-desk-faint" fill="none">
        {/* Frame: r10 top-left, 45° cut top-right, r44 bottom-right, notch bottom-left. */}
        <path
          d="M18 8 H378 L412 42 V248 A44 44 0 0 1 368 292 H24 V278 H8 V18 A10 10 0 0 1 18 8 Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="7 7"
          strokeLinejoin="round"
        />
        <rect x="44" y="44" width="150" height="10" rx="3" className="fill-desk-line" />
        <rect x="44" y="62" width="96" height="8" rx="3" className="fill-desk-sunken" />
      </svg>
      <ul className="absolute inset-x-[10.5%] top-[31%] grid gap-[3.2%]">
        {ANSWER_SLOTS.map((slot, i) => (
          <li
            key={slot.letter}
            className="flex h-[clamp(30px,5.2vw,38px)] items-center gap-3 rounded-[6px_2px_12px_2px] border-2 border-dashed border-desk-line pl-1.5"
            style={{ marginRight: `${i * 4}%` }}
          >
            <span
              className="grid aspect-square h-[78%] place-items-center rounded-[5px_2px_8px_2px] shadow-[inset_0_0_0_1px_var(--desk-line)]"
              style={{ background: slot.color, color: slot.ink }}
            >
              <AnswerSymbol kind={slot.symbol} size={16} />
            </span>
            <span className="font-numeral text-lg leading-none text-desk-faint">{slot.letter}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
