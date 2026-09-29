"use client";

import { NusaAvatar } from "@/components/game/NusaAvatar";
import { AchievementIcon } from "@/components/game/AchievementIcon";
import { ACHIEVEMENTS } from "@/lib/game/types";
import { DEMO_PLAYERS } from "@/lib/seed/players";
import { useT } from "@/lib/i18n/client";
import { Specimen, Subhead } from "../primitives";

export function AvatarsSection() {
  const t = useT();
  const ladder = [24, 32, 44, 64, 84, 120];
  const sample = DEMO_PLAYERS[4]!;
  return (
    <div className="grid gap-10">
      <div className="flex flex-wrap items-end gap-6">
        {ladder.map((s) => (
          <Specimen key={s} label={`${s}px`}>
            <NusaAvatar seed={sample.avatarSeed} size={s} />
          </Specimen>
        ))}
        <Specimen label={`148px · ring · ${t("design.states.self")}`}>
          <NusaAvatar seed={sample.avatarSeed} size={148} ring />
        </Specimen>
      </div>
      <div>
        <Subhead>DEMO_PLAYERS · {DEMO_PLAYERS.length}</Subhead>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-x-3 gap-y-5">
          {DEMO_PLAYERS.map((p) => (
            <li key={p.id} className="flex min-w-0 flex-col items-center gap-2">
              <NusaAvatar seed={p.avatarSeed} size={56} />
              <span className="w-full truncate text-center text-xs font-bold text-stage-muted">{p.nickname}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function AchievementsSection() {
  const t = useT();
  return (
    <ul className="grid gap-x-6 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
      {ACHIEVEMENTS.map((id) => (
        <li key={id} className="nf nf-md nf-solid flex items-center gap-4 p-4">
          <span className="flex shrink-0 items-center gap-2">
            <AchievementIcon id={id} earned size={60} />
            <AchievementIcon id={id} earned={false} size={44} />
          </span>
          <span className="min-w-0">
            <span className="block font-extrabold text-kapas">{t(`achievements.${id}`)}</span>
            <span className="mt-0.5 block text-sm leading-snug text-stage-muted">{t(`achievements.${id}Desc`)}</span>
            <span className="hud-label mt-2 block text-[10px] text-stage-faint">
              {t("design.states.earned")} · {t("design.states.notEarned")}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
