"use client";

import { useState, useSyncExternalStore } from "react";
import { LayoutGroup } from "motion/react";
import { Sparkles } from "lucide-react";
import { NusaLeaderboardRow } from "@/components/game/NusaLeaderboardRow";
import { NusaPodium } from "@/components/game/NusaPodium";
import { KawungConfetti } from "@/components/game/KawungConfetti";
import { NusaRoomCodeDisplay, NusaRoomCodeInput } from "@/components/game/NusaRoomCode";
import { NusaQRCode } from "@/components/game/NusaQRCode";
import { NusaButton } from "@/components/ui/NusaButton";
import { DEMO_LEADERBOARD, DEMO_SELF } from "@/lib/seed/players";
import { useT } from "@/lib/i18n/client";
import { ReplayButton, Specimen, Subhead, useReplay } from "../primitives";

const DEMO_CODE = "482913";
const noSubscribe = () => () => undefined;

export function LeaderboardSection() {
  const t = useT();
  const { run, replay } = useReplay();
  const self = DEMO_LEADERBOARD.find((e) => e.playerId === DEMO_SELF.id)!;
  return (
    <div className="grid gap-10" key={run}>
      <div className="flex justify-end">
        <ReplayButton onClick={replay} />
      </div>
      <div className="grid gap-12">
        <div className="max-w-[380px]">
          <Subhead>{t("design.labels.phone")}</Subhead>
          <LayoutGroup id="lb-phone">
            <ol className="grid gap-2">
              {DEMO_LEADERBOARD.slice(0, 3).map((e) => (
                <NusaLeaderboardRow key={e.playerId} entry={e} size="phone" />
              ))}
              <NusaLeaderboardRow entry={{ ...self, rank: 4 }} size="phone" self />
              <NusaLeaderboardRow entry={DEMO_LEADERBOARD[6]!} size="phone" />
            </ol>
          </LayoutGroup>
          <p className="hud-label mt-3 text-[10px] text-stage-faint">01–03 · {t("design.states.self")} · 07</p>
        </div>
        <div>
          <Subhead>{t("design.labels.host")}</Subhead>
          <LayoutGroup id="lb-host">
            <ol className="grid gap-[1.4vh]">
              {[DEMO_LEADERBOARD[0]!, DEMO_LEADERBOARD[1]!, DEMO_LEADERBOARD[4]!].map((e, i) => (
                <NusaLeaderboardRow
                  key={e.playerId}
                  entry={e}
                  size="host"
                  style={{ marginLeft: `${i * 5.5}%` }}
                  className="w-[78%]"
                />
              ))}
            </ol>
          </LayoutGroup>
        </div>
      </div>
    </div>
  );
}

export function PodiumSection() {
  const t = useT();
  const { run, replay } = useReplay();
  const [celebrate, setCelebrate] = useState(false);
  return (
    <div>
      <div className="flex flex-wrap justify-end gap-3">
        <NusaButton
          variant={celebrate ? "sun" : "ghost"}
          size="sm"
          aria-pressed={celebrate}
          icon={<Sparkles size={16} aria-hidden="true" />}
          onClick={() => setCelebrate((c) => !c)}
        >
          {t("design.labels.confetti")}
        </NusaButton>
        <ReplayButton
          onClick={() => {
            setCelebrate(false);
            replay();
          }}
        />
      </div>
      {/* Pillars are sized in vh (projector units), so the stage gets a vh-based height too. */}
      <div className="nf nf-lg nf-outline relative mt-5 h-[calc(46vh+320px)] overflow-hidden px-4 pt-6">
        {celebrate && <KawungConfetti count={36} />}
        <NusaPodium key={run} entries={DEMO_LEADERBOARD} onRevealed={(rank) => rank === 1 && setCelebrate(true)} />
      </div>
    </div>
  );
}

export function RoomCodeSection() {
  const t = useT();
  const [value, setValue] = useState("");
  const origin = useSyncExternalStore(
    noSubscribe,
    () => window.location.origin,
    () => "",
  );
  return (
    <div className="grid gap-12">
      <div className="grid items-end gap-10 lg:grid-cols-[minmax(0,1fr)_auto]">
        <Specimen label={t("host.pinLabel")}>
          <NusaRoomCodeDisplay
            code={DEMO_CODE}
            label={t("host.pinLabel")}
            className="[&_p]:text-[clamp(4.5rem,11vw,9rem)]"
          />
        </Specimen>
        <Specimen label="NusaQRCode">
          <NusaQRCode
            value={origin ? `${origin}/join?room=${DEMO_CODE}` : ""}
            size={220}
            label={`${t("host.orScan")}: /join?room=${DEMO_CODE}`}
          />
        </Specimen>
      </div>
      <div className="grid gap-x-8 gap-y-10 md:grid-cols-3">
        <Specimen label={`${t("design.states.default")} · ${t("design.live")}`}>
          <NusaRoomCodeInput value={value} onChange={setValue} label={t("join.codeLabel")} hint={t("join.codeHint")} />
        </Specimen>
        <Specimen label={t("design.states.filled")}>
          <div inert className="w-full">
            <NusaRoomCodeInput
              value={DEMO_CODE}
              onChange={() => undefined}
              label={t("join.codeLabel")}
              hint={t("join.codeHint")}
            />
          </div>
        </Specimen>
        <Specimen label={t("design.states.error")}>
          <div inert className="w-full">
            <NusaRoomCodeInput
              value="48291"
              onChange={() => undefined}
              label={t("join.codeLabel")}
              error={t("errors.invalidCode")}
            />
          </div>
        </Specimen>
      </div>
    </div>
  );
}
