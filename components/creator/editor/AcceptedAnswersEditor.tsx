"use client";

import { useEffect, useRef } from "react";
import { Plus, X } from "lucide-react";
import { NusaButton } from "@/components/ui/NusaButton";
import { LIMITS } from "@/lib/quiz/schema";
import { normalizeText } from "@/lib/game/evaluate";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";
import { answerRowClass, answerTextClass, AutoGrowText, IconButton, InlineIssue } from "./ui";
import type { AnswerEditorProps } from "./types";

/**
 * Short answer: a list of accepted spellings. Each row previews the normalised form
 * the engine actually compares ("Domain Name System" → "domain name system"), so the
 * lecturer can see that case and punctuation don't matter.
 */
export function AcceptedAnswersEditor({ question, onChange, issues, showIssues }: AnswerEditorProps) {
  const t = useT();
  const inputs = useRef<Array<HTMLTextAreaElement | null>>([]);
  const addRef = useRef<HTMLSpanElement>(null);
  const pendingFocus = useRef<number | "add" | null>(null);

  useEffect(() => {
    if (pendingFocus.current === null) return;
    const target =
      pendingFocus.current === "add" ? addRef.current?.querySelector("button") : inputs.current[pendingFocus.current];
    target?.focus();
    pendingFocus.current = null;
  });

  const accepted = question.acceptedAnswers?.length ? question.acceptedAnswers : [""];
  const issue = showIssues ? issues.find((i) => i.field === "accepted") : undefined;
  const issueId = `accepted-issue-${question.id}`;

  const write = (next: string[], structural = false) =>
    onChange((q) => ({ ...q, acceptedAnswers: next }), { structural });

  return (
    <div>
      <ul className="grid grid-cols-1 gap-2" aria-describedby={issue ? issueId : undefined}>
        {accepted.map((value, index) => {
          const n = index + 1;
          const normalized = normalizeText(value);
          return (
            <li
              key={index}
              className={cn(
                answerRowClass,
                "pl-4",
                issue && index === 0 && "[--nf-stroke-w:2px] [--nf-stroke:var(--danger)]",
              )}
            >
              <AutoGrowText
                ref={(el) => {
                  inputs.current[index] = el;
                }}
                value={value}
                onValueChange={(text) => write(accepted.map((v, i) => (i === index ? text : v)))}
                onEnter={() => {
                  if (index + 1 < accepted.length) inputs.current[index + 1]?.focus();
                  else if (accepted.length < LIMITS.acceptedAnswers) {
                    pendingFocus.current = accepted.length;
                    write([...accepted, ""]);
                  }
                }}
                maxLength={LIMITS.answer}
                placeholder={index === 0 ? t("editor.acceptedPlaceholder") : t("editor.acceptedLabel", { n })}
                aria-label={t("editor.acceptedLabel", { n })}
                className={answerTextClass}
              />
              {normalized && normalized !== value.trim() && (
                <span
                  className="hidden max-w-[40%] truncate font-mono text-xs text-desk-faint sm:block"
                  aria-hidden="true"
                >
                  = {normalized}
                </span>
              )}
              <IconButton
                label={t("editor.removeAccepted", { n })}
                icon={<X size={18} aria-hidden="true" />}
                tone="danger"
                disabled={accepted.length <= 1}
                onClick={() => {
                  pendingFocus.current = Math.max(0, index - 1);
                  write(
                    accepted.filter((_, i) => i !== index),
                    true,
                  );
                }}
              />
            </li>
          );
        })}
      </ul>
      {issue && <InlineIssue id={issueId}>{t(`editor.validation.${issue.code}`)}</InlineIssue>}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span ref={addRef}>
          <NusaButton
            variant="desk-quiet"
            size="sm"
            icon={<Plus size={16} aria-hidden="true" />}
            disabled={accepted.length >= LIMITS.acceptedAnswers}
            onClick={() => {
              pendingFocus.current = accepted.length;
              write([...accepted, ""]);
            }}
          >
            {t("editor.addAccepted")}
          </NusaButton>
        </span>
        <p className="text-[13px] text-desk-muted">{t("editor.acceptedAnswersHint")}</p>
      </div>
    </div>
  );
}
