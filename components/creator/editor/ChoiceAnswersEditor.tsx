"use client";

import { useEffect, useRef } from "react";
import { Check, Plus, X } from "lucide-react";
import { AnswerSymbol, answerSlot } from "@/components/game/AnswerSymbol";
import { NusaButton } from "@/components/ui/NusaButton";
import { LIMITS, maxAnswers } from "@/lib/quiz/schema";
import { newAnswer, reindex } from "@/lib/quiz/factory";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";
import { answerRowClass, answerTextClass, AutoGrowText, IconButton, InlineIssue } from "./ui";
import type { AnswerEditorProps } from "./types";

/**
 * Choices for single, multiple, true/false and poll questions. Each row carries the
 * same identity the students see (symbol chip + letter + position), so the lecturer
 * writes "B · Round Robin", not "option 2". Enter jumps to the next choice.
 */
export function ChoiceAnswersEditor({ question, onChange, issues, showIssues }: AnswerEditorProps) {
  const t = useT();
  const inputs = useRef(new Map<string, HTMLTextAreaElement>());
  const addRef = useRef<HTMLSpanElement>(null);
  const pendingFocus = useRef<string | null>(null);

  // Focus the row created or kept by the last add/remove, once it exists in the DOM.
  useEffect(() => {
    if (!pendingFocus.current) return;
    const target =
      pendingFocus.current === "add"
        ? addRef.current?.querySelector("button")
        : inputs.current.get(pendingFocus.current);
    target?.focus();
    pendingFocus.current = null;
  });

  const type = question.type;
  const fixed = type === "true_false";
  const multi = type === "multiple";
  const scored = type !== "poll";
  const max = maxAnswers(type);
  const canRemove = !fixed && question.answers.length > LIMITS.answersMin;
  const canAdd = !fixed && question.answers.length < max;
  const answerIssue = showIssues ? issues.find((i) => i.field === "answers") : undefined;
  const issueId = `answers-issue-${question.id}`;

  const setText = (id: string, text: string) =>
    onChange((q) => ({ ...q, answers: q.answers.map((a) => (a.id === id ? { ...a, text } : a)) }));

  const setCorrect = (id: string) =>
    onChange((q) => ({
      ...q,
      answers: q.answers.map((a) =>
        multi ? (a.id === id ? { ...a, isCorrect: !a.isCorrect } : a) : { ...a, isCorrect: a.id === id },
      ),
    }));

  const add = () => {
    const answer = newAnswer(question.answers.length);
    pendingFocus.current = answer.id;
    onChange((q) => ({ ...q, answers: reindex([...q.answers, answer]) }));
  };

  const next = (index: number) => {
    const following = question.answers[index + 1];
    if (following) inputs.current.get(following.id)?.focus();
    else if (canAdd) add();
  };

  const remove = (index: number) => {
    const id = question.answers[index]!.id;
    const neighbour = question.answers[index + 1] ?? question.answers[index - 1];
    pendingFocus.current = neighbour?.id ?? "add";
    onChange((q) => ({ ...q, answers: reindex(q.answers.filter((a) => a.id !== id)) }), { structural: true });
  };

  return (
    <div>
      <ul className="grid grid-cols-1 gap-2" aria-describedby={answerIssue ? issueId : undefined}>
        {question.answers.map((answer, index) => {
          const slot = answerSlot(index);
          const flagged = answerIssue?.answerId === answer.id;
          const correct = scored && answer.isCorrect;
          return (
            <li
              key={answer.id}
              data-correct={correct || undefined}
              className={cn(
                answerRowClass,
                "pl-1.5",
                correct &&
                  "[--nf-fill:color-mix(in_oklab,var(--success)_9%,white)] [--nf-stroke-w:2px] [--nf-stroke:var(--success)]",
                flagged && "[--nf-stroke-w:2px] [--nf-stroke:var(--danger)]",
              )}
            >
              <span
                className="nf nf-sm grid size-11 shrink-0 place-items-center self-start [--nf-fill:var(--binus-blue-950)]"
                style={{ color: slot.color }}
                aria-hidden="true"
              >
                <AnswerSymbol kind={slot.symbol} size={22} />
              </span>
              <span
                className="font-numeral w-4 shrink-0 self-start pt-2 text-center text-2xl leading-none text-desk-muted"
                aria-hidden="true"
              >
                {slot.letter}
              </span>
              <AutoGrowText
                ref={(el) => {
                  if (el) inputs.current.set(answer.id, el);
                  else inputs.current.delete(answer.id);
                }}
                value={answer.text}
                onValueChange={(text) => setText(answer.id, text)}
                onEnter={() => next(index)}
                maxLength={LIMITS.answer}
                placeholder={t("editor.answerLabel", { letter: slot.letter })}
                aria-label={t("editor.answerLabel", { letter: slot.letter })}
                aria-invalid={flagged || undefined}
                className={answerTextClass}
              />
              {scored && (
                <label
                  title={correct ? undefined : t("editor.markCorrectFor", { letter: slot.letter })}
                  className={cn(
                    "inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[8px_2px_12px_2px] px-2.5 text-[13px] font-bold transition-colors select-none",
                    "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-binus-500",
                    correct ? "bg-success text-binus-950" : "text-desk-faint hover:bg-desk-sunken hover:text-desk-text",
                  )}
                >
                  <input
                    type={multi ? "checkbox" : "radio"}
                    name={`correct-${question.id}`}
                    checked={correct}
                    onChange={() => setCorrect(answer.id)}
                    aria-label={t("editor.markCorrectFor", { letter: slot.letter })}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-5 place-items-center border-2",
                      multi ? "rounded-[5px_1px_7px_1px]" : "rounded-full",
                      correct ? "border-binus-950 bg-binus-950 text-success" : "border-current",
                    )}
                  >
                    {correct && <Check size={13} strokeWidth={3.5} />}
                  </span>
                  {correct && <span aria-hidden="true">{t("editor.correct")}</span>}
                </label>
              )}
              {!fixed && (
                <IconButton
                  label={t("editor.removeAnswer", { letter: slot.letter })}
                  icon={<X size={18} aria-hidden="true" />}
                  tone="danger"
                  disabled={!canRemove}
                  onClick={() => remove(index)}
                />
              )}
            </li>
          );
        })}
      </ul>

      {answerIssue && <InlineIssue id={issueId}>{t(`editor.validation.${answerIssue.code}`)}</InlineIssue>}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {!fixed && (
          <span ref={addRef}>
            <NusaButton
              variant="desk-quiet"
              size="sm"
              icon={<Plus size={16} aria-hidden="true" />}
              onClick={add}
              disabled={!canAdd}
            >
              {t("editor.addAnswer")}
            </NusaButton>
          </span>
        )}
        <p className="text-[13px] text-desk-muted">
          {t(`editor.choiceHints.${type as "single" | "multiple" | "true_false" | "poll"}`)}
          {!fixed && <span className="text-desk-faint"> · {t("editor.answersMax", { max })}</span>}
        </p>
      </div>
    </div>
  );
}
