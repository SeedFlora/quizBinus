"use client";

import type { KeyboardEvent, RefObject } from "react";
import { ArrowDown, ArrowUp, CircleCheck, TriangleAlert } from "lucide-react";
import { AnswerSymbol, answerSlot } from "@/components/game/AnswerSymbol";
import type { Question, QuestionType } from "@/lib/game/types";
import type { QuizValidation } from "@/lib/quiz/schema";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";
import { AddQuestionMenu } from "./AddQuestionMenu";
import { TYPE_ICONS, TYPE_LABEL_KEYS } from "./question-types";
import { IconButton } from "./ui";

/**
 * Left pane: the running order of the quiz. Each entry shows its number in the
 * display numerals, its type, the start of the prompt and a tiny answer key built
 * from the same symbols the students press, plus a ready / needs-work marker.
 */
export function QuestionNavigator({
  questions,
  validation,
  selectedId,
  onSelect,
  onMove,
  onAdd,
  itemRefs,
}: {
  questions: Question[];
  validation: QuizValidation;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  onAdd: (type: QuestionType) => void;
  itemRefs: RefObject<Map<string, HTMLButtonElement>>;
}) {
  const { t } = useI18n();

  // Arrow keys walk the list (selection follows focus); Alt+Arrow is handled by the editor.
  const onKeyDown = (event: KeyboardEvent<HTMLOListElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const index = questions.findIndex((q) => q.id === selectedId);
    const target =
      event.key === "ArrowDown"
        ? index + 1
        : event.key === "ArrowUp"
          ? index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? questions.length - 1
              : null;
    if (target === null) return;
    const next = questions[Math.max(0, Math.min(questions.length - 1, target))];
    if (!next) return;
    event.preventDefault();
    onSelect(next.id);
    itemRefs.current.get(next.id)?.focus();
  };

  return (
    <nav aria-label={t("editor.questionList")} className="flex min-h-0 flex-col @3xl:h-full">
      <div className="flex items-baseline justify-between gap-3 px-4 pt-4 pb-3 @3xl:px-5 @3xl:pt-6">
        <h2 className="text-[13px] font-bold text-desk-muted">{t("editor.questions")}</h2>
        <span className="font-numeral text-3xl leading-none text-desk-text" aria-hidden="true">
          {String(questions.length).padStart(2, "0")}
        </span>
      </div>

      <ol
        onKeyDown={onKeyDown}
        className="flex min-h-0 gap-2 overflow-x-auto px-4 pb-3 @3xl:grid @3xl:flex-1 @3xl:content-start @3xl:gap-1.5 @3xl:overflow-x-visible @3xl:overflow-y-auto @3xl:px-3"
      >
        {questions.map((question, index) => {
          const issues = validation.questions[question.id] ?? [];
          const selected = question.id === selectedId;
          return (
            <li key={question.id} className="w-52 shrink-0 @3xl:w-auto">
              <div
                className={cn(
                  "relative flex h-full items-stretch",
                  selected
                    ? "nf nf-sm nf-desk [--nf-stroke-w:2px] [--nf-stroke:var(--binus-blue-500)]"
                    : "rounded-[6px_2px_16px_2px] hover:bg-desk-sunken",
                )}
              >
                <button
                  ref={(el) => {
                    if (el) itemRefs.current.set(question.id, el);
                    else itemRefs.current.delete(question.id);
                  }}
                  type="button"
                  aria-current={selected ? "true" : undefined}
                  tabIndex={selected || (!selectedId && index === 0) ? 0 : -1}
                  onClick={() => onSelect(question.id)}
                  className="min-w-0 flex-1 rounded-[6px_2px_16px_2px] px-3 py-2.5 text-left focus-visible:outline-offset-0"
                >
                  <NavigatorItem question={question} index={index} issueCount={issues.length} selected={selected} />
                </button>
                {selected && questions.length > 1 && (
                  <div className="flex flex-col justify-center pr-1">
                    <IconButton
                      size="sm"
                      label={t("editor.moveUp")}
                      icon={<ArrowUp size={15} aria-hidden="true" />}
                      disabled={index === 0}
                      onClick={() => onMove(question.id, -1)}
                    />
                    <IconButton
                      size="sm"
                      label={t("editor.moveDown")}
                      icon={<ArrowDown size={15} aria-hidden="true" />}
                      disabled={index === questions.length - 1}
                      onClick={() => onMove(question.id, 1)}
                    />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="border-desk-line px-4 pb-4 @3xl:border-t @3xl:px-3 @3xl:pt-3">
        <AddQuestionMenu onAdd={onAdd} />
        <p className="mt-2 hidden text-center text-[11.5px] text-desk-faint @3xl:block">{t("editor.shortcuts")}</p>
      </div>
    </nav>
  );
}

function NavigatorItem({
  question,
  index,
  issueCount,
  selected,
}: {
  question: Question;
  index: number;
  issueCount: number;
  selected: boolean;
}) {
  const { t } = useI18n();
  const Icon = TYPE_ICONS[question.type];
  const prompt = question.prompt.trim();
  return (
    <span className="grid gap-1.5">
      <span className="flex items-center gap-2">
        <span className="sr-only">{t("editor.questionN", { n: index + 1 })}</span>
        <span
          className={cn("font-numeral text-[1.75rem] leading-none", selected ? "text-binus-500" : "text-desk-text")}
          aria-hidden="true"
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <Icon size={15} className="text-desk-muted" aria-hidden="true" />
        <span className="sr-only">{t(TYPE_LABEL_KEYS[question.type])}.</span>
        <span className="ml-auto">
          {issueCount === 0 ? (
            <span className="flex items-center text-success" title={t("editor.statusReady")}>
              <CircleCheck size={17} strokeWidth={2.5} aria-hidden="true" />
              <span className="sr-only">{t("editor.statusReady")}</span>
            </span>
          ) : (
            <span
              className="inline-flex h-5 items-center gap-1 rounded-full bg-warning px-1.5 text-[11px] font-extrabold text-ink"
              title={t("editor.statusIssues", { count: issueCount })}
            >
              <TriangleAlert size={11} strokeWidth={2.75} aria-hidden="true" />
              <span aria-hidden="true">{issueCount}</span>
              <span className="sr-only">{t("editor.statusIssues", { count: issueCount })}</span>
            </span>
          )}
        </span>
      </span>
      <span
        className={cn(
          "line-clamp-2 text-[13px] leading-snug",
          prompt ? "font-semibold text-desk-text" : "text-desk-faint italic",
        )}
      >
        {prompt || t("editor.emptyPrompt")}
      </span>
      <AnswerKey question={question} />
    </span>
  );
}

/** A glanceable answer key: symbol chips for choice questions, the value for typed ones. */
function AnswerKey({ question }: { question: Question }) {
  const { t, locale } = useI18n();
  if (question.type === "short_answer") {
    const first = question.acceptedAnswers?.find((a) => a.trim());
    return first ? <span className="truncate font-mono text-[11.5px] text-desk-muted">= {first}</span> : null;
  }
  if (question.type === "numeric") {
    const spec = question.numeric;
    return spec ? (
      <span className="truncate font-mono text-[11.5px] text-desk-muted">
        = {formatNumber(spec.value, locale)}
        {spec.tolerance ? ` ± ${formatNumber(spec.tolerance, locale)}` : ""}
        {spec.unit ? ` ${spec.unit}` : ""}
      </span>
    ) : null;
  }
  if (question.type === "ordering") return null;
  const scored = question.type !== "poll";
  const letters = question.answers.filter((a) => a.isCorrect).map((a) => answerSlot(a.position).letter);
  return (
    <span className="flex items-center gap-1">
      {question.answers.map((answer, i) => {
        const slot = answerSlot(i);
        return (
          <span
            key={answer.id}
            aria-hidden="true"
            className={cn(
              "nf grid size-[22px] place-items-center [--nf-br:7px] [--nf-cut:5px] [--nf-fill:var(--binus-blue-950)] [--nf-notch:2px] [--nf-tl:3px]",
              scored && !answer.isCorrect && "opacity-25",
            )}
            style={{ color: slot.color }}
          >
            <AnswerSymbol kind={slot.symbol} size={13} />
          </span>
        );
      })}
      {scored && letters.length > 0 && (
        <span className="sr-only">{t("editor.answerKey", { letters: letters.join(", ") })}</span>
      )}
    </span>
  );
}

/** Same decimal style as the numeric editor ("7,5" in Bahasa Indonesia). No grouping: it is an answer key. */
function formatNumber(n: number, locale: string) {
  return new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-GB", {
    maximumFractionDigits: 6,
    useGrouping: false,
  }).format(n);
}
