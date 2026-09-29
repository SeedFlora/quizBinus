"use client";

import { CircleCheck, TriangleAlert } from "lucide-react";
import type { Question } from "@/lib/game/types";
import type { IssueField, QuizValidation } from "@/lib/quiz/schema";
import { useT } from "@/lib/i18n/client";
import { usePopover } from "./use-popover";

/**
 * "3 hal perlu diperbaiki" / "Siap dimainkan". The count opens a checklist; every
 * item jumps straight to the field that needs attention.
 */
export function ValidationSummary({
  validation,
  questions,
  onReveal,
  onJumpQuestion,
  onJumpQuiz,
}: {
  validation: QuizValidation;
  questions: Question[];
  onReveal: () => void;
  onJumpQuestion: (questionId: string, field: IssueField) => void;
  onJumpQuiz: () => void;
}) {
  const t = useT();
  const { open, close, anchorRef, panelRef, panelId, triggerProps } = usePopover<HTMLDivElement>();

  if (validation.ready) {
    return (
      <p className="flex min-h-11 items-center gap-1.5 text-[13px] font-bold text-desk-text">
        <CircleCheck size={17} className="text-success" strokeWidth={2.5} aria-hidden="true" />
        {t("editor.ready")}
      </p>
    );
  }

  const items: Array<{ key: string; where: string; message: string; go: () => void }> = [
    ...validation.quizIssues.map((code) => ({
      key: `quiz-${code}`,
      where: t("editor.issuesQuiz"),
      message: t(`editor.validation.${code}`),
      go: onJumpQuiz,
    })),
    ...questions.flatMap((q, index) =>
      (validation.questions[q.id] ?? []).map((issue, i) => ({
        key: `${q.id}-${i}`,
        where: t("editor.questionN", { n: index + 1 }),
        message: t(`editor.validation.${issue.code}`),
        go: () => onJumpQuestion(q.id, issue.field),
      })),
    ),
  ];

  return (
    <div className="relative">
      <span ref={anchorRef} className="block">
        <button
          type="button"
          {...triggerProps}
          onClick={() => {
            onReveal();
            triggerProps.onClick();
          }}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-[8px_2px_12px_2px] bg-warning/25 px-3 text-[13px] font-bold text-ink transition-colors hover:bg-warning/40"
        >
          <TriangleAlert size={15} strokeWidth={2.5} aria-hidden="true" />
          {t("editor.issues", { count: validation.count })}
        </button>
      </span>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          className="nf nf-md nf-desk absolute top-full right-0 z-40 mt-2 w-[min(90vw,360px)] p-2 drop-shadow-[0_18px_30px_rgb(10_22_51/0.16)]"
        >
          <p className="px-3 pt-2 pb-1 text-[13px] font-bold text-desk-muted">{t("editor.issuesTitle")}</p>
          <ul className="max-h-[50vh] overflow-y-auto">
            {items.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => {
                    close(false);
                    item.go();
                  }}
                  className="grid min-h-11 w-full gap-0.5 rounded-[8px_2px_12px_2px] px-3 py-2 text-left hover:bg-desk-sunken focus-visible:bg-desk-sunken focus-visible:outline-offset-0"
                >
                  <span className="text-[13px] font-extrabold text-desk-text">{item.where}</span>
                  <span className="text-[13px] leading-snug text-desk-muted">{item.message}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
