"use client";

import Link from "next/link";
import type { Ref } from "react";
import { ArrowLeft, Play, SlidersHorizontal, Undo2 } from "lucide-react";
import { NusaButton } from "@/components/ui/NusaButton";
import type { Quiz } from "@/lib/game/types";
import { LIMITS, type IssueField, type QuizValidation } from "@/lib/quiz/schema";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";
import { SaveIndicator } from "./SaveIndicator";
import { IconButton } from "./ui";
import type { SaveStatus } from "./use-autosave";
import { ValidationSummary } from "./ValidationSummary";

/**
 * Sticky editor bar: where am I (title, course), is it safe (save state, undo),
 * is it playable (validation), and the one orange action: start a session.
 */
export function EditorTopBar({
  quiz,
  validation,
  saveStatus,
  savedAt,
  canUndo,
  starting,
  titleRef,
  onTitle,
  onRetrySave,
  onUndo,
  onOpenDetails,
  onRevealIssues,
  onJumpQuestion,
  onStart,
}: {
  quiz: Quiz;
  validation: QuizValidation;
  saveStatus: SaveStatus;
  savedAt: Date | null;
  canUndo: boolean;
  starting: boolean;
  titleRef: Ref<HTMLInputElement>;
  onTitle: (title: string) => void;
  onRetrySave: () => void;
  onUndo: () => void;
  onOpenDetails: () => void;
  onRevealIssues: () => void;
  onJumpQuestion: (questionId: string, field: IssueField) => void;
  onStart: () => void;
}) {
  const t = useT();
  const course = [quiz.course.courseCode, quiz.course.courseName, quiz.course.className].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3 sm:px-6">
      <Link
        href="/quizzes"
        className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-[8px_2px_12px_2px] px-2 text-sm font-bold text-desk-muted hover:bg-desk-sunken hover:text-desk-text"
      >
        <ArrowLeft size={18} aria-hidden="true" />
        <span className="max-xl:sr-only">{t("creator.nav.quizzes")}</span>
      </Link>

      <div className="min-w-[14rem] flex-1">
        <label htmlFor="quiz-title" className="sr-only">
          {t("editor.titleLabel")}
        </label>
        <input
          ref={titleRef}
          id="quiz-title"
          value={quiz.title}
          maxLength={LIMITS.title}
          placeholder={t("editor.titlePlaceholder")}
          onChange={(e) => onTitle(e.target.value)}
          aria-invalid={validation.quizIssues.includes("titleRequired") || undefined}
          className={cn(
            "font-display-tight -mx-1 w-full truncate border-b-2 border-transparent bg-transparent px-1 pb-0.5 text-[1.625rem] leading-tight text-desk-text placeholder:text-desk-faint",
            "hover:border-desk-line focus:border-binus-500 focus:outline-none",
          )}
        />
        <button
          type="button"
          onClick={onOpenDetails}
          className="mt-0.5 inline-flex min-h-7 max-w-full items-center gap-1.5 text-[13px] font-semibold text-desk-muted hover:text-binus-500"
        >
          <SlidersHorizontal size={13} aria-hidden="true" />
          <span className="truncate">{course || t("editor.noCourse")}</span>
          <span className="shrink-0 font-bold text-binus-500">· {t("editor.details")}</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SaveIndicator status={saveStatus} savedAt={savedAt} onRetry={onRetrySave} />
        <IconButton
          label={`${t("editor.undoHint")} (Ctrl+Z)`}
          icon={<Undo2 size={18} aria-hidden="true" />}
          disabled={!canUndo}
          onClick={onUndo}
        />
        <ValidationSummary
          validation={validation}
          questions={quiz.questions}
          onReveal={onRevealIssues}
          onJumpQuestion={onJumpQuestion}
          onJumpQuiz={onOpenDetails}
        />
        <NusaButton
          variant="energy"
          icon={<Play size={17} fill="currentColor" aria-hidden="true" />}
          loading={starting}
          loadingLabel={t("editor.starting")}
          aria-disabled={!validation.ready || undefined}
          title={validation.ready ? undefined : t("editor.startBlocked", { count: validation.count })}
          className={cn(!validation.ready && "opacity-55")}
          onClick={onStart}
        >
          {t("editor.host")}
        </NusaButton>
      </div>
    </div>
  );
}
