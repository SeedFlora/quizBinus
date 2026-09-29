"use client";

import { useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Field, Segmented, Select, TextInput } from "@/components/ui/desk/Field";
import { NusaButton } from "@/components/ui/NusaButton";
import { POINT_PRESETS, TIME_LIMITS, type Question, type QuestionType, type Quiz } from "@/lib/game/types";
import { LIMITS, type QuestionIssue } from "@/lib/quiz/schema";
import { useT } from "@/lib/i18n/client";
import { FUTURE_TYPES, isQuestionType, PLAYABLE_TYPES, TYPE_HINT_KEYS, TYPE_LABEL_KEYS } from "./question-types";
import { ScoringExplainer } from "./ScoringExplainer";
import { SectionTitle } from "./ui";
import type { QuestionChange } from "./types";

type PointsChoice = `${(typeof POINT_PRESETS)[number]}` | "custom";

/**
 * Right pane, top: how this question plays (type, time, points). Keyed by question
 * id so local UI state (custom points) resets per question.
 */
export function QuestionSettings({
  question,
  issues,
  showIssues,
  onChange,
  onChangeType,
}: {
  question: Question;
  issues: QuestionIssue[];
  showIssues: boolean;
  onChange: QuestionChange;
  onChangeType: (type: QuestionType) => void;
}) {
  const t = useT();
  const isPoll = question.type === "poll";
  const isPreset = (POINT_PRESETS as readonly number[]).includes(question.points);
  const [custom, setCustom] = useState(!isPreset);
  const customRef = useRef<HTMLInputElement>(null);
  const pointsChoice: PointsChoice = custom || !isPreset ? "custom" : (String(question.points) as PointsChoice);
  const timeIssue = showIssues ? issues.find((i) => i.field === "timeLimit") : undefined;
  const pointsIssue = showIssues ? issues.find((i) => i.field === "points") : undefined;

  return (
    <section aria-labelledby="settings-title">
      <SectionTitle id="settings-title">{t("editor.settings")}</SectionTitle>
      <div className="grid gap-5">
        <Field label={t("editor.type")} hint={t(TYPE_HINT_KEYS[question.type])}>
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={question.type}
              onChange={(e) => {
                if (isQuestionType(e.target.value)) onChangeType(e.target.value);
              }}
            >
              {PLAYABLE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(TYPE_LABEL_KEYS[type])}
                </option>
              ))}
              <optgroup label={t("editor.comingSoon")}>
                {FUTURE_TYPES.map((type) => (
                  <option key={type} value={type} disabled>
                    {t(TYPE_LABEL_KEYS[type])} · {t("editor.comingSoon")}
                  </option>
                ))}
              </optgroup>
            </Select>
          )}
        </Field>

        <div className="grid gap-1.5" data-field="timeLimit">
          <p className="text-sm font-bold text-desk-text">{t("editor.timerLabel")}</p>
          <Segmented
            name={`timer-${question.id}`}
            label={t("editor.timerLabel")}
            size="sm"
            value={question.timeLimit}
            options={TIME_LIMITS.map((s) => ({ value: s as number, label: <span className="tabular">{s}</span> }))}
            onChange={(timeLimit) => onChange((q) => ({ ...q, timeLimit }))}
            // One row of nine: time presets read as a scale, not as wrapped chips.
            className="grid! w-full grid-cols-9 [&>label]:px-0"
          />
          {timeIssue && (
            <p className="text-[13px] font-semibold text-danger">{t(`editor.validation.${timeIssue.code}`)}</p>
          )}
        </div>

        <div className="grid gap-1.5" data-field="points">
          <p className="text-sm font-bold text-desk-text">{t("editor.points")}</p>
          <Segmented<PointsChoice>
            name={`points-${question.id}`}
            label={t("editor.points")}
            size="sm"
            value={pointsChoice}
            options={[
              ...POINT_PRESETS.map((p) => ({
                value: String(p) as PointsChoice,
                label: <span className="tabular">{p}</span>,
                disabled: isPoll && p !== 0,
              })),
              { value: "custom" as const, label: t("editor.customPoints"), disabled: isPoll },
            ]}
            onChange={(choice) => {
              if (choice === "custom") {
                setCustom(true);
                // Select the current value so typing replaces it instead of appending.
                requestAnimationFrame(() => {
                  customRef.current?.focus();
                  customRef.current?.select();
                });
                return;
              }
              setCustom(false);
              onChange((q) => ({ ...q, points: Number(choice) }));
            }}
            className="w-full [&>label]:flex-1 [&>label]:px-2"
          />
          {pointsChoice === "custom" && !isPoll && (
            <Field
              label={t("editor.customPointsLabel")}
              className="mt-2"
              error={pointsIssue ? t(`editor.validation.${pointsIssue.code}`) : undefined}
            >
              {({ id, describedBy, invalid }) => (
                <TextInput
                  ref={customRef}
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={LIMITS.pointsMax}
                  step={50}
                  value={Number.isFinite(question.points) ? question.points : ""}
                  onChange={(e) => {
                    const points = Math.round(Number(e.target.value));
                    onChange((q) => ({ ...q, points: Number.isFinite(points) ? points : 0 }));
                  }}
                  className="font-numeral text-2xl!"
                />
              )}
            </Field>
          )}
          {isPoll && <p className="text-[13px] text-desk-muted">{t("editor.pointsHintPoll")}</p>}
        </div>
      </div>
    </section>
  );
}

/** Right pane, bottom: what the points mean, and the quiz-level mode/difficulty. */
export function ScoringAndQuiz({
  quiz,
  question,
  onOpenDetails,
}: {
  quiz: Quiz;
  question: Question;
  onOpenDetails: () => void;
}) {
  const t = useT();
  const isPoll = question.type === "poll";
  return (
    <div className="grid gap-5">
      <section aria-labelledby="scoring-title" className="border-t border-desk-line pt-5">
        <SectionTitle id="scoring-title">{t("editor.scoring")}</SectionTitle>
        <ScoringExplainer mode={quiz.mode} points={question.points} scored={!isPoll} />
      </section>

      <section
        aria-labelledby="this-quiz-title"
        className="flex items-center justify-between gap-3 border-t border-desk-line pt-5"
      >
        <div className="min-w-0">
          <h2 id="this-quiz-title" className="text-[13px] font-bold text-desk-muted">
            {t("editor.thisQuiz")}
          </h2>
          <p className="mt-0.5 truncate text-sm font-bold text-desk-text">
            {t(`editor.modes.${quiz.mode}`)} · {t(`editor.difficulties.${quiz.difficulty}`)}
          </p>
        </div>
        <NusaButton
          variant="desk-quiet"
          size="sm"
          icon={<SlidersHorizontal size={15} aria-hidden="true" />}
          onClick={onOpenDetails}
        >
          {t("editor.editDetails")}
        </NusaButton>
      </section>
    </div>
  );
}
