"use client";

import type { Ref } from "react";
import { ArrowDown, ArrowUp, Copy, Trash2 } from "lucide-react";
import { Field, TextArea, TextInput } from "@/components/ui/desk/Field";
import type { Question } from "@/lib/game/types";
import { LIMITS, type QuestionIssue } from "@/lib/quiz/schema";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";
import { AcceptedAnswersEditor } from "./AcceptedAnswersEditor";
import { ChoiceAnswersEditor } from "./ChoiceAnswersEditor";
import { MediaField } from "./MediaField";
import { NumericEditor } from "./NumericEditor";
import { OrderingEditor } from "./OrderingEditor";
import { TYPE_ICONS, TYPE_LABEL_KEYS } from "./question-types";
import { IconButton, SectionTitle } from "./ui";
import type { QuestionChange } from "./types";

const orUndefined = (value: string) => (value.trim() ? value : undefined);

/**
 * Centre pane. Grouped by who sees what, and when: the students during the
 * question, everyone after the reveal, and the lecturer later in analytics.
 */
export function QuestionEditor({
  quizId,
  question,
  index,
  total,
  issues,
  showIssues,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
  promptRef,
}: {
  quizId: string;
  question: Question;
  index: number;
  total: number;
  issues: QuestionIssue[];
  showIssues: boolean;
  onChange: QuestionChange;
  onMove: (delta: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  promptRef: Ref<HTMLTextAreaElement>;
}) {
  const t = useT();
  const n = index + 1;
  const TypeIcon = TYPE_ICONS[question.type];
  const promptIssue = showIssues ? issues.find((i) => i.field === "prompt") : undefined;
  const answerProps = { question, onChange, issues, showIssues };

  const answersTitle =
    question.type === "short_answer"
      ? t("editor.acceptedAnswers")
      : question.type === "numeric"
        ? t("editor.correctAnswer")
        : question.type === "ordering"
          ? t("editor.orderingTitle")
          : t("editor.answers");

  return (
    <section aria-labelledby="question-heading" className="min-w-0">
      <header className="flex items-end gap-3 sm:gap-4">
        <span
          className="font-numeral -mb-1 text-[4.75rem] leading-[0.8] text-desk-line select-none sm:text-[5.5rem]"
          aria-hidden="true"
        >
          {String(n).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1 pb-0.5">
          <h2 id="question-heading" className="text-sm font-extrabold text-desk-text">
            {t("editor.questionOf", { n, total })}
          </h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-[13px] font-semibold text-desk-muted">
            <TypeIcon size={14} aria-hidden="true" />
            {t(TYPE_LABEL_KEYS[question.type])}
          </p>
        </div>
        <div className="flex shrink-0 items-center">
          <IconButton
            label={t("editor.moveUp")}
            icon={<ArrowUp size={18} aria-hidden="true" />}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          />
          <IconButton
            label={t("editor.moveDown")}
            icon={<ArrowDown size={18} aria-hidden="true" />}
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          />
          <IconButton
            label={t("editor.duplicateQuestion")}
            icon={<Copy size={17} aria-hidden="true" />}
            onClick={onDuplicate}
          />
          <IconButton
            label={t("editor.deleteQuestion")}
            icon={<Trash2 size={17} aria-hidden="true" />}
            tone="danger"
            onClick={onDelete}
          />
        </div>
      </header>

      {/* ------- what students see ------- */}
      <div className="nf nf-lg nf-desk mt-4 p-5 @min-[480px]:p-7">
        <SectionTitle>{t("editor.sections.students")}</SectionTitle>
        <div className="grid grid-cols-1 gap-5">
          <Field
            label={t("editor.questionPrompt")}
            error={promptIssue ? t(`editor.validation.${promptIssue.code}`) : undefined}
            hint={
              <span className={cn("tabular", question.prompt.length > LIMITS.prompt * 0.9 && "font-bold text-warning")}>
                {t("editor.promptCount", { count: question.prompt.length, max: LIMITS.prompt })}
              </span>
            }
          >
            {({ id, describedBy, invalid }) => (
              <TextArea
                ref={promptRef}
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                rows={3}
                maxLength={LIMITS.prompt}
                value={question.prompt}
                placeholder={t("editor.questionPromptPlaceholder")}
                onChange={(e) => {
                  const prompt = e.target.value;
                  onChange((q) => ({ ...q, prompt }));
                }}
                className="text-[1.1875rem]! leading-snug! font-bold"
              />
            )}
          </Field>

          <Field label={t("editor.description")} optional={t("editor.optional")}>
            {({ id, describedBy }) => (
              <TextArea
                id={id}
                aria-describedby={describedBy}
                rows={2}
                maxLength={LIMITS.questionDescription}
                value={question.description ?? ""}
                placeholder={t("editor.descriptionPlaceholder")}
                onChange={(e) => {
                  const description = orUndefined(e.target.value);
                  onChange((q) => ({ ...q, description }));
                }}
              />
            )}
          </Field>

          <div className="grid gap-1.5">
            <p className="text-sm font-bold text-desk-text">
              {t("editor.media")}
              <span className="ml-1.5 font-medium text-desk-faint">{t("editor.optional")}</span>
            </p>
            <MediaField
              quizId={quizId}
              url={question.mediaUrl}
              onChange={(mediaUrl, options) => onChange((q) => ({ ...q, mediaUrl }), options)}
            />
          </div>

          <div
            role="group"
            aria-labelledby={`answers-title-${question.id}`}
            data-field={
              question.type === "short_answer" ? "accepted" : question.type === "numeric" ? "numeric" : "answers"
            }
          >
            <p id={`answers-title-${question.id}`} className="mb-2 text-sm font-bold text-desk-text">
              {answersTitle}
            </p>
            {question.type === "ordering" ? (
              <OrderingEditor {...answerProps} />
            ) : question.type === "short_answer" ? (
              <AcceptedAnswersEditor {...answerProps} />
            ) : question.type === "numeric" ? (
              <NumericEditor key={question.id} {...answerProps} />
            ) : (
              <ChoiceAnswersEditor {...answerProps} />
            )}
          </div>
        </div>
      </div>

      {/* ------- after the reveal ------- */}
      <div className="nf nf-lg nf-desk mt-4 p-5 @min-[480px]:p-7">
        <SectionTitle>{t("editor.sections.reveal")}</SectionTitle>
        <Field label={t("editor.explanation")} optional={t("editor.optional")}>
          {({ id, describedBy }) => (
            <TextArea
              id={id}
              aria-describedby={describedBy}
              rows={3}
              maxLength={LIMITS.explanation}
              value={question.explanation ?? ""}
              placeholder={t("editor.explanationPlaceholder")}
              onChange={(e) => {
                const explanation = orUndefined(e.target.value);
                onChange((q) => ({ ...q, explanation }));
              }}
            />
          )}
        </Field>
      </div>

      {/* ------- for analytics ------- */}
      <div className="nf nf-lg nf-desk mt-4 p-5 @min-[480px]:p-7">
        <SectionTitle>{t("editor.sections.analytics")}</SectionTitle>
        <div className="grid grid-cols-1 gap-5 @min-[480px]:grid-cols-2">
          <Field label={t("editor.topic")} optional={t("editor.optional")}>
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                maxLength={LIMITS.shortField}
                value={question.topic ?? ""}
                placeholder={t("editor.topicPlaceholder")}
                onChange={(e) => {
                  const topic = orUndefined(e.target.value);
                  onChange((q) => ({ ...q, topic }));
                }}
              />
            )}
          </Field>
          <Field label={t("editor.learningOutcome")} optional={t("editor.optional")}>
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                maxLength={LIMITS.shortField}
                value={question.learningOutcome ?? ""}
                placeholder={t("editor.learningOutcomePlaceholder")}
                onChange={(e) => {
                  const learningOutcome = orUndefined(e.target.value);
                  onChange((q) => ({ ...q, learningOutcome }));
                }}
              />
            )}
          </Field>
        </div>
      </div>
    </section>
  );
}
