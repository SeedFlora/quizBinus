"use client";

import { useEffect, useState } from "react";
import { NusaTimer } from "@/components/game/NusaTimer";
import { NusaScore } from "@/components/game/NusaScore";
import { NusaRankTransition, RankMovement } from "@/components/game/NusaRank";
import { StreakFlame } from "@/components/game/StreakFlame";
import { NusaMeter, NusaQuestionProgress } from "@/components/game/NusaProgress";
import { useT } from "@/lib/i18n/client";
import { ReplayButton, Specimen, Subhead, useMounted, useReplay } from "../primitives";

/** A deadline `seconds` from now that restarts itself after `loopMs`, so the specimen never sits at 00. */
function useLoopingDeadline(seconds: number, loopMs: number) {
  const [deadline, setDeadline] = useState(() => Date.now() + seconds * 1000);
  useEffect(() => {
    const id = window.setInterval(() => setDeadline(Date.now() + seconds * 1000), loopMs);
    return () => window.clearInterval(id);
  }, [seconds, loopMs]);
  return deadline;
}

function Timers() {
  const t = useT();
  const running = useLoopingDeadline(20, 22_000);
  const urgent = useLoopingDeadline(5.4, 7_000);
  const [done] = useState(() => Date.now() - 1000);
  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end gap-x-10 gap-y-6">
        <Specimen label={t("design.states.running")}>
          <NusaTimer totalSeconds={20} deadlineAt={running} />
        </Specimen>
        <Specimen label={t("design.states.urgent")}>
          <NusaTimer totalSeconds={20} deadlineAt={urgent} />
        </Specimen>
        <Specimen label={t("design.states.paused")}>
          <NusaTimer totalSeconds={20} deadlineAt={null} paused pausedRemainingMs={12_000} />
        </Specimen>
        <Specimen label={t("design.states.done")}>
          <NusaTimer totalSeconds={20} deadlineAt={done} />
        </Specimen>
      </div>
      <div className="flex flex-wrap items-end gap-x-10 gap-y-6">
        <Specimen label="mini">
          <NusaTimer size="mini" totalSeconds={20} deadlineAt={running} />
        </Specimen>
        <Specimen label={t("design.labels.host")}>
          <NusaTimer size="host" totalSeconds={20} deadlineAt={urgent} />
        </Specimen>
      </div>
    </div>
  );
}

export function TimerSection() {
  const mounted = useMounted();
  // Countdowns read the wall clock, so they render after hydration only.
  return mounted ? <Timers /> : <div className="h-[440px]" aria-hidden="true" />;
}

export function ScoringSection() {
  const t = useT();
  const { run, replay } = useReplay();
  return (
    <div className="grid gap-10" key={run}>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-wrap items-end gap-x-12 gap-y-6">
          <Specimen label={t("result.pointsGained", { points: 850 })}>
            <p className="font-numeral text-giga text-kapas">
              <NusaScore value={850} prefix="+" suffix=" PTS" delay={0.2} />
            </p>
          </Specimen>
          <Specimen label={t("result.totalScore")}>
            <p className="font-numeral text-6xl leading-none text-sun">
              <NusaScore value={8420} from={7570} delay={0.4} />
            </p>
          </Specimen>
          <Specimen label={t("result.rank")}>
            <span className="flex items-baseline gap-2">
              <NusaRankTransition from={7} to={3} delay={900} className="text-6xl text-kapas" />
              <RankMovement previous={7} current={3} size="lg" />
            </span>
          </Specimen>
        </div>
        <ReplayButton onClick={replay} />
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <Subhead>RankMovement</Subhead>
          <div className="flex flex-wrap items-end gap-8">
            {(["sm", "md", "lg"] as const).map((size) => (
              <Specimen key={size} label={size}>
                <span className="flex items-baseline gap-4">
                  <RankMovement previous={5} current={2} size={size} />
                  <RankMovement previous={2} current={4} size={size} />
                  <RankMovement previous={3} current={3} size={size} />
                </span>
              </Specimen>
            ))}
          </div>
        </div>
        <div>
          <Subhead>StreakFlame</Subhead>
          <div className="flex flex-wrap items-end gap-5">
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <Specimen key={n} label={`×${n}`}>
                <StreakFlame streak={n} size={34} />
              </Specimen>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProgressSection() {
  const t = useT();
  const steps = [0, 3, 9];
  const meters = [
    { value: 12, tone: "sky" as const },
    { value: 34, tone: "sky" as const },
    { value: 42, tone: "sun" as const },
    { value: 20, tone: "energy" as const },
  ];
  return (
    <div className="grid gap-10 md:grid-cols-2">
      <div className="grid gap-6">
        <Subhead>NusaQuestionProgress</Subhead>
        {steps.map((s) => (
          <Specimen key={s} label={`${t("common.question")} ${s + 1} ${t("common.of")} 10`}>
            <NusaQuestionProgress
              current={s}
              total={10}
              label={`${t("common.question")} ${s + 1} ${t("common.of")} 10`}
            />
          </Specimen>
        ))}
      </div>
      <div className="grid gap-6">
        <Subhead>NusaMeter</Subhead>
        {meters.map((m) => (
          <Specimen
            key={`${m.value}-${m.tone}`}
            label={`${t("play.answeredCount", { answered: m.value, total: 42 })} · ${m.tone}`}
          >
            <NusaMeter
              value={m.value}
              max={42}
              tone={m.tone}
              label={t("play.answeredCount", { answered: m.value, total: 42 })}
            />
          </Specimen>
        ))}
      </div>
    </div>
  );
}
