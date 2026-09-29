"use client";

import Link from "next/link";
import { useEffect, useState, type ComponentType } from "react";
import { LayoutGrid, Music2 } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { StageBackground } from "@/components/brand/StageBackground";
import { NusaLink } from "@/components/ui/NusaButton";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";
import { Section } from "./primitives";
import { BadgesSection, ButtonsSection, FramesSection } from "./sections/Controls";
import { AnswersSection, SymbolsSection } from "./sections/Answers";
import { ProgressSection, ScoringSection, TimerSection } from "./sections/Hud";
import { LeaderboardSection, PodiumSection, RoomCodeSection } from "./sections/Standings";
import { AchievementsSection, AvatarsSection } from "./sections/Identity";
import { CelebrationSection, PatternsSection } from "./sections/Patterns";
import { DeskSection } from "./sections/Desk";
import { ColorSection, MotionSection, SoundSection, TypeSection } from "./sections/Foundations";

type SectionKey =
  | "color"
  | "type"
  | "frames"
  | "patterns"
  | "buttons"
  | "badges"
  | "answers"
  | "symbols"
  | "timer"
  | "scoring"
  | "progress"
  | "leaderboard"
  | "podium"
  | "celebration"
  | "roomCode"
  | "avatars"
  | "achievements"
  | "desk"
  | "motion"
  | "sound";

/** Foundations first, then components in the order a round meets them. */
const SECTIONS: Array<{ key: SectionKey; Body: ComponentType }> = [
  { key: "color", Body: ColorSection },
  { key: "type", Body: TypeSection },
  { key: "frames", Body: FramesSection },
  { key: "patterns", Body: PatternsSection },
  { key: "buttons", Body: ButtonsSection },
  { key: "badges", Body: BadgesSection },
  { key: "answers", Body: AnswersSection },
  { key: "symbols", Body: SymbolsSection },
  { key: "timer", Body: TimerSection },
  { key: "scoring", Body: ScoringSection },
  { key: "progress", Body: ProgressSection },
  { key: "leaderboard", Body: LeaderboardSection },
  { key: "podium", Body: PodiumSection },
  { key: "celebration", Body: CelebrationSection },
  { key: "roomCode", Body: RoomCodeSection },
  { key: "avatars", Body: AvatarsSection },
  { key: "achievements", Body: AchievementsSection },
  { key: "desk", Body: DeskSection },
  { key: "motion", Body: MotionSection },
  { key: "sound", Body: SoundSection },
];

/** Highlights the section currently under the top third of the viewport. */
function useActiveSection(keys: string[]) {
  const [active, setActive] = useState(keys[0]);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    keys.forEach((k) => {
      const el = document.getElementById(k);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [keys]);
  return active;
}

const KEYS = SECTIONS.map((s) => s.key);

/**
 * /design: every Nusa component in every state, the foundations it is built on,
 * and links to the fixture previews and sound lab. A team reference, not product UI.
 */
export function DesignGallery() {
  const t = useT();
  const active = useActiveSection(KEYS);

  return (
    <div className="stage isolate min-h-dvh overflow-clip">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <StageBackground pattern="kawung" intensity="quiet" fade="edges" />
      </div>

      <a
        href="#gallery-main"
        className="sr-only-focusable fixed top-3 left-3 z-50 bg-sun px-4 py-2 font-bold text-binus-950"
      >
        {t("common.skipToContent")}
      </a>

      <div className="mx-auto grid max-w-[1440px] grid-cols-[minmax(0,1fr)] lg:grid-cols-[232px_minmax(0,1fr)]">
        {/* index rail */}
        <aside className="border-stage-line lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:border-r">
          <div className="px-4 pt-6 sm:px-8 lg:px-6 lg:pt-8">
            <Link href="/" className="inline-block rounded-sm">
              <Wordmark size="sm" />
            </Link>
          </div>
          <nav aria-label={t("design.jumpTo")} className="px-4 pt-6 pb-4 sm:px-8 lg:px-4 lg:pb-10">
            <p className="hud-label mb-3 hidden px-2 text-[10px] text-stage-faint lg:block">{t("design.jumpTo")}</p>
            <ol className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
              {SECTIONS.map(({ key }, i) => (
                <li key={key} className="shrink-0">
                  <a
                    href={`#${key}`}
                    aria-current={active === key ? "location" : undefined}
                    className={cn(
                      "flex min-h-10 items-center gap-3 rounded-[8px_2px_12px_2px] px-2 text-sm font-bold whitespace-nowrap transition-colors",
                      active === key ? "bg-kapas/10 text-kapas" : "text-stage-muted hover:text-kapas",
                    )}
                  >
                    <span
                      className={cn(
                        "font-numeral w-6 text-lg leading-none",
                        active === key ? "text-sun" : "text-stage-faint",
                      )}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {t(`design.sections.${key}`)}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <main id="gallery-main" className="min-w-0 px-4 pb-24 sm:px-8 lg:px-12">
          <header className="pt-8 pb-14 lg:pt-12">
            <div className="flex flex-wrap justify-end gap-3">
              <NusaLink href="/preview" variant="ghost" size="sm" icon={<LayoutGrid size={16} aria-hidden="true" />}>
                {t("design.toPreviews")}
              </NusaLink>
              <NusaLink href="/lab/audio" variant="ghost" size="sm" icon={<Music2 size={16} aria-hidden="true" />}>
                {t("design.toSoundLab")}
              </NusaLink>
            </div>
            <p className="hud-label mt-10 text-stage-muted">{t("design.eyebrow")}</p>
            <h1 className="font-numeral mt-3 text-[clamp(4rem,10vw,8.5rem)] leading-[0.82] text-kapas uppercase">
              {t("design.title")}
            </h1>
            <p className="mt-5 max-w-[60ch] text-lg leading-relaxed text-pretty text-stage-muted">
              {t("design.subtitle")}
            </p>
          </header>

          {SECTIONS.map(({ key, Body }, i) => (
            <Section
              key={key}
              id={key}
              index={i + 1}
              title={t(`design.sections.${key}`)}
              note={t(`design.notes.${key}`)}
            >
              <Body />
            </Section>
          ))}
        </main>
      </div>
    </div>
  );
}
