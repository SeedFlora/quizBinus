"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import dynamic from "next/dynamic";
import { Info, RefreshCw } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { DeskHeader } from "@/components/creator/CreatorShell";
import { getQuizRepository } from "@/components/creator/data";
import { formatShortDate, formatTime, formatWeekday } from "@/components/creator/format";
import { useCreatorStorage } from "@/components/creator/storage-context";
import { NusaButton } from "@/components/ui/NusaButton";
import { NusaSpinner } from "@/components/ui/NusaSpinner";
import type { SessionAnalytics } from "@/lib/analytics/compute";
import { formatInteger } from "@/lib/analytics/format";
import {
  defaultSessionId,
  listAnalyticsSessions,
  loadSessionAnalytics,
  type AnalyticsSessionOption,
  type LoadedSessionAnalytics,
} from "@/lib/analytics/sources";
import { useI18n } from "@/lib/i18n/client";
import { ExportActions } from "./ExportActions";
import { Highlights } from "./Highlights";
import { OutcomePerformance } from "./OutcomePerformance";
import { Scoreboard } from "./Scoreboard";
import { SessionPicker } from "./SessionPicker";
import { StudentRanking } from "./StudentRanking";
import { questionAnchor } from "./labels";

// The two chart-heavy panels ship in their own chunks; placeholders hold their space.
const DifficultyChart = dynamic(() => import("./DifficultyChart").then((m) => m.DifficultyChart), {
  loading: () => <PanelPlaceholder height={420} />,
});
const DistributionLedger = dynamic(() => import("./DistributionLedger").then((m) => m.DistributionLedger), {
  loading: () => <PanelPlaceholder height={640} />,
});

type Loaded = { key: string; sessions: AnalyticsSessionOption[]; loaded: LoadedSessionAnalytics };

/**
 * Post-game analytics for one quiz session. Data is read in the browser (sessions
 * hosted from this browser live in localStorage; server reports use the lecturer's
 * cookie), then every section renders from one pure SessionAnalytics object.
 */
export function AnalyticsScreen({
  quizId,
  sessionId,
  initialTitle,
}: {
  quizId: string;
  sessionId: string | null;
  initialTitle?: string;
}) {
  const { t } = useI18n();
  const storage = useCreatorStorage();
  const reduce = useReducedMotion();
  const [reloads, setReloads] = useState(0);
  const [result, setResult] = useState<Loaded | { key: string; error: true } | null>(null);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const requestKey = `${quizId}|${sessionId ?? ""}|${reloads}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const context = { storage, repository: getQuizRepository(storage) };
      const sessions = await listAnalyticsSessions(quizId, context);
      const loaded = await loadSessionAnalytics(sessionId ?? defaultSessionId(sessions), { quizId, ...context });
      if (cancelled) return;
      setResult({ key: requestKey, sessions, loaded });
      // Open the hardest question's breakdown: it is the first thing worth discussing.
      const hardest = loaded.analytics.highlights.hardest?.questionId;
      setOpen(new Set(hardest ? [hardest] : []));
    })().catch(() => {
      if (!cancelled) setResult({ key: requestKey, error: true });
    });
    return () => {
      cancelled = true;
    };
  }, [quizId, sessionId, requestKey, storage]);

  const toggle = useCallback((questionId: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  }, []);

  /** From a highlight or a chart column: open the question's line, bring it into view, move focus there. */
  const openQuestion = useCallback(
    (questionId: string) => {
      flushSync(() => setOpen((prev) => new Set(prev).add(questionId)));
      const line = document.getElementById(questionAnchor(questionId));
      if (!line) return;
      line.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      line.querySelector<HTMLButtonElement>("h3 button")?.focus({ preventScroll: true });
    },
    [reduce],
  );

  const current = result && result.key === requestKey ? result : null;

  if (!current) {
    return (
      <>
        <DeskHeader eyebrow={t("analytics.title")} title={initialTitle ?? t("analytics.title")} />
        <div role="status" className="flex min-h-[50dvh] flex-col items-center justify-center gap-4 text-desk-muted">
          <NusaSpinner size={36} className="text-binus-500" />
          <p className="font-bold">{t("analytics.loading")}</p>
        </div>
      </>
    );
  }

  if ("error" in current) {
    return (
      <>
        <DeskHeader eyebrow={t("analytics.title")} title={initialTitle ?? t("analytics.title")} />
        <div role="alert" className="flex min-h-[40dvh] flex-col items-center justify-center gap-5 px-5 text-center">
          <p className="max-w-[48ch] font-bold text-desk-text">{t("analytics.loadError")}</p>
          <NusaButton
            variant="desk-quiet"
            size="sm"
            icon={<RefreshCw size={16} aria-hidden="true" />}
            onClick={() => setReloads((n) => n + 1)}
          >
            {t("common.retry")}
          </NusaButton>
        </div>
      </>
    );
  }

  const { analytics, source, missingId } = current.loaded;
  return (
    <Report
      quizId={quizId}
      analytics={analytics}
      sessions={current.sessions}
      current={{
        id: analytics.session.id,
        source,
        roomCode: analytics.session.roomCode,
        startedAt: analytics.session.startedAt,
        participants: analytics.overview.participants,
        status: analytics.session.status,
      }}
      missingId={missingId}
      open={open}
      onToggle={toggle}
      onOpenQuestion={openQuestion}
      onRefresh={() => setReloads((n) => n + 1)}
    />
  );
}

function Report({
  quizId,
  analytics,
  sessions,
  current,
  missingId,
  open,
  onToggle,
  onOpenQuestion,
  onRefresh,
}: {
  quizId: string;
  analytics: SessionAnalytics;
  sessions: AnalyticsSessionOption[];
  current: AnalyticsSessionOption;
  missingId: string | null;
  open: ReadonlySet<string>;
  onToggle: (questionId: string) => void;
  onOpenQuestion: (questionId: string) => void;
  onRefresh: () => void;
}) {
  const { t, locale } = useI18n();
  const { quiz, session, overview } = analytics;
  const course = [quiz.courseCode, quiz.courseName].filter(Boolean).join(" ");
  const eyebrow = [t("analytics.title"), course, quiz.className].filter(Boolean).join(" · ");
  const subtitle =
    session.startedAt === null
      ? t("analytics.sessionMetaUndated", {
          players: formatInteger(overview.participants, locale),
          total: quiz.totalQuestions,
        })
      : t("analytics.sessionMeta", {
          date: `${formatWeekday(session.startedAt, locale)}, ${formatShortDate(session.startedAt, locale)} · ${formatTime(session.startedAt, locale)}`,
          players: formatInteger(overview.participants, locale),
          played: overview.playedQuestions,
          total: quiz.totalQuestions,
        });
  const hasData = overview.playedQuestions > 0;

  return (
    <>
      <DeskHeader
        eyebrow={eyebrow}
        title={quiz.title}
        subtitle={subtitle}
        actions={hasData ? <ExportActions analytics={analytics} /> : undefined}
      />

      <div className="mx-auto max-w-[1400px] px-5 pb-24 sm:px-10">
        <div className="flex flex-col gap-4 border-b border-desk-line py-5">
          <SessionPicker quizId={quizId} sessions={sessions} current={current} />
          {missingId && <Notice>{t("analytics.missingNotice", { id: missingId })}</Notice>}
          {current.source === "demo" && !missingId && <Notice>{t("analytics.demoNotice")}</Notice>}
          {session.status === "in_progress" && (
            <Notice
              action={
                <NusaButton
                  variant="desk-quiet"
                  size="sm"
                  icon={<RefreshCw size={16} aria-hidden="true" />}
                  onClick={onRefresh}
                >
                  {t("analytics.refresh")}
                </NusaButton>
              }
            >
              {t("analytics.liveNotice")}
            </Notice>
          )}
          {session.status === "ended" && overview.playedQuestions < quiz.totalQuestions && (
            <Notice>
              {t("analytics.endedEarlyNotice", { played: overview.playedQuestions, total: quiz.totalQuestions })}
            </Notice>
          )}
        </div>

        {!hasData ? (
          <p className="py-16 text-center font-bold text-desk-muted">{t("analytics.noPlayed")}</p>
        ) : (
          <>
            <div className="mt-8">
              <Scoreboard analytics={analytics} />
            </div>
            <div className="mt-12">
              <Highlights analytics={analytics} onOpenQuestion={onOpenQuestion} />
            </div>
            {/* Per question → per learning outcome → the detail behind each question. */}
            <div className="mt-12">
              <DifficultyChart questions={analytics.questions} onOpenQuestion={onOpenQuestion} />
            </div>
            <div className="mt-8">
              <OutcomePerformance analytics={analytics} />
            </div>
            <div className="mt-8">
              <DistributionLedger questions={analytics.questions} open={open} onToggle={onToggle} />
            </div>
            <div className="mt-8">
              <StudentRanking students={analytics.students} />
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Notice({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-l-2 border-binus-500 pl-4">
      <p className="flex max-w-[80ch] items-start gap-2 text-sm text-desk-muted">
        <Info size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-binus-500" />
        {children}
      </p>
      {action}
    </div>
  );
}

function PanelPlaceholder({ height }: { height: number }) {
  return <div aria-hidden="true" className="nf nf-lg nf-desk" style={{ height }} />;
}
