"use client";

import { useEffect, useRef } from "react";
import { ArrowDown, ArrowUp, Plus, Shuffle, X } from "lucide-react";
import { NusaButton } from "@/components/ui/NusaButton";
import { LIMITS } from "@/lib/quiz/schema";
import { moveItem, newAnswer, reindex } from "@/lib/quiz/factory";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";
import { answerRowClass, answerTextClass, AutoGrowText, IconButton, InlineIssue } from "./ui";
import type { AnswerEditorProps } from "./types";

/**
 * Ordering questions: the authoring order IS the correct order. Steps are numbered
 * with the display numerals; players receive a deterministic shuffle.
 */
export function OrderingEditor({ question, onChange, issues, showIssues }: AnswerEditorProps) {
  const t = useT();
  const inputs = useRef(new Map<string, HTMLElement>());
  const addRef = useRef<HTMLSpanElement>(null);
  const pendingFocus = useRef<string | null>(null);

  useEffect(() => {
    if (!pendingFocus.current) return;
    const target =
      pendingFocus.current === "add"
        ? addRef.current?.querySelector("button")
        : inputs.current.get(pendingFocus.current);
    target?.focus();
    pendingFocus.current = null;
  });

  const steps = question.answers;
  const issue = showIssues ? issues.find((i) => i.field === "answers") : undefined;
  const issueId = `ordering-issue-${question.id}`;

  const setText = (id: string, text: string) =>
    onChange((q) => ({ ...q, answers: q.answers.map((a) => (a.id === id ? { ...a, text } : a)) }));

  const move = (index: number, delta: -1 | 1) => {
    // Keep keyboard focus on the moved step's input.
    pendingFocus.current = steps[index]!.id;
    onChange((q) => ({ ...q, answers: moveItem(q.answers, index, delta) }), { structural: true });
  };

  const add = () => {
    const step = newAnswer(steps.length);
    pendingFocus.current = step.id;
    onChange((q) => ({ ...q, answers: reindex([...q.answers, step]) }));
  };

  const remove = (index: number) => {
    const id = steps[index]!.id;
    pendingFocus.current = (steps[index + 1] ?? steps[index - 1])?.id ?? "add";
    onChange((q) => ({ ...q, answers: reindex(q.answers.filter((a) => a.id !== id)) }), { structural: true });
  };

  return (
    <div>
      <p className="mb-3 flex flex-wrap items-center gap-x-2 text-[13px] text-desk-muted">
        {t("editor.orderingHint")}
        <span className="inline-flex items-center gap-1 text-desk-faint">
          <Shuffle size={13} aria-hidden="true" />
          {t("editor.orderingShuffled")}
        </span>
      </p>
      <ol className="grid grid-cols-1 gap-2" aria-describedby={issue ? issueId : undefined}>
        {steps.map((step, index) => {
          const n = index + 1;
          const flagged = issue?.answerId === step.id;
          return (
            <li
              key={step.id}
              className={cn(answerRowClass, "pl-3", flagged && "[--nf-stroke-w:2px] [--nf-stroke:var(--danger)]")}
            >
              <span
                className="font-numeral w-8 shrink-0 self-start pt-2 text-3xl leading-none text-binus-500 tabular-nums"
                aria-hidden="true"
              >
                {String(n).padStart(2, "0")}
              </span>
              <AutoGrowText
                ref={(el) => {
                  if (el) inputs.current.set(step.id, el);
                  else inputs.current.delete(step.id);
                }}
                value={step.text}
                onValueChange={(text) => setText(step.id, text)}
                onEnter={() => {
                  const following = steps[index + 1];
                  if (following) inputs.current.get(following.id)?.focus();
                  else if (steps.length < LIMITS.orderingMax) add();
                }}
                maxLength={LIMITS.answer}
                placeholder={t("editor.stepLabel", { n })}
                aria-label={t("editor.stepLabel", { n })}
                aria-invalid={flagged || undefined}
                className={answerTextClass}
              />
              <IconButton
                size="sm"
                label={t("editor.moveStepUp", { n })}
                icon={<ArrowUp size={16} aria-hidden="true" />}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              />
              <IconButton
                size="sm"
                label={t("editor.moveStepDown", { n })}
                icon={<ArrowDown size={16} aria-hidden="true" />}
                disabled={index === steps.length - 1}
                onClick={() => move(index, 1)}
              />
              <IconButton
                label={t("editor.removeStep", { n })}
                icon={<X size={18} aria-hidden="true" />}
                tone="danger"
                disabled={steps.length <= LIMITS.answersMin}
                onClick={() => remove(index)}
              />
            </li>
          );
        })}
      </ol>
      {issue && <InlineIssue id={issueId}>{t(`editor.validation.${issue.code}`)}</InlineIssue>}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span ref={addRef}>
          <NusaButton
            variant="desk-quiet"
            size="sm"
            icon={<Plus size={16} aria-hidden="true" />}
            onClick={add}
            disabled={steps.length >= LIMITS.orderingMax}
          >
            {t("editor.addStep")}
          </NusaButton>
        </span>
        <p className="text-[13px] text-desk-faint">{t("editor.answersMax", { max: LIMITS.orderingMax })}</p>
      </div>
    </div>
  );
}
