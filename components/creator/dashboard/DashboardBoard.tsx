"use client";

import { useMemo } from "react";
import { teachingPulse, type SessionRecord } from "../data";
import type { UpcomingClass } from "../schedule";
import { useStartSession } from "../start-session";
import { useQuizList, useSessionHistory } from "../use-creator-data";
import { LatestSession } from "./LatestSession";
import { NextClassBand } from "./NextClassBand";
import { RecentQuizzes } from "./RecentQuizzes";
import { TeachingPulse } from "./TeachingPulse";

const NO_SESSIONS: SessionRecord[] = [];

/**
 * Dashboard body below the greeting. Asymmetric on purpose: the next class spans
 * the page, the numbers sit on hairlines, and the reading column (recent arenas)
 * is wider than the side story (latest session).
 */
export function DashboardBoard({ now, upcoming }: { now: number; upcoming: UpcomingClass | null }) {
  const { items } = useQuizList();
  const sessions = useSessionHistory(now).records ?? NO_SESSIONS;
  const { start, pending, failed } = useStartSession();

  const pulse = useMemo(() => teachingPulse(sessions, now), [sessions, now]);
  const latest = useMemo(() => sessions.find((s) => s.status !== "ended") ?? sessions[0], [sessions]);
  const classQuiz = upcoming?.slot.quizId ? items?.find((q) => q.id === upcoming.slot.quizId) : undefined;

  return (
    <div className="px-5 pb-20 sm:px-10">
      {upcoming && (
        <NextClassBand
          upcoming={upcoming}
          quiz={classQuiz}
          pending={pending !== null && pending === classQuiz?.id}
          startError={failed && failed.quizId === classQuiz?.id ? failed.code : null}
          onStart={(id) => void start(id)}
        />
      )}

      <div className="mt-6">
        <TeachingPulse pulse={pulse} />
      </div>

      <div className="mt-12 grid gap-12 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] xl:gap-14">
        <RecentQuizzes items={items ? items.slice(0, 4) : null} />
        <div>
          <LatestSession record={latest} />
        </div>
      </div>
    </div>
  );
}
