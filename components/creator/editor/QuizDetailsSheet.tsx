"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { Field, Segmented, TextArea, TextInput } from "@/components/ui/desk/Field";
import { NusaButton } from "@/components/ui/NusaButton";
import { NusaBadge } from "@/components/ui/NusaBadge";
import { DIFFICULTIES, ENABLED_GAME_MODES, GAME_MODES, type CourseInfo, type Quiz } from "@/lib/game/types";
import { LIMITS } from "@/lib/quiz/schema";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";
import { IconButton } from "./ui";
import type { QuizPatch } from "./editor-state";

const orUndefined = (value: string) => (value.trim() ? value : undefined);

/**
 * Quiz-level metadata in a side sheet (native <dialog>: modal focus containment,
 * Esc to close and focus restoration come from the platform).
 */
export function QuizDetailsSheet({
  open,
  quiz,
  showIssues,
  onClose,
  onPatch,
  onPatchCourse,
}: {
  open: boolean;
  quiz: Quiz;
  showIssues: boolean;
  onClose: () => void;
  onPatch: (patch: QuizPatch) => void;
  onPatchCourse: (patch: Partial<CourseInfo>) => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const titleError = showIssues && !quiz.title.trim() ? t("editor.validation.titleRequired") : undefined;

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Click on the backdrop (the dialog element itself, outside the panel) closes.
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "m-0 ml-auto h-dvh max-h-dvh w-[min(100vw,32rem)] max-w-none bg-transparent p-0 text-desk-text backdrop:bg-[rgb(2_9_24/0.42)]",
        "translate-x-0 opacity-100 transition-[translate,opacity,display,overlay] transition-discrete duration-300 ease-out-expo",
        "motion-reduce:transition-none starting:open:translate-x-10 starting:open:opacity-0",
      )}
    >
      <div className="theme-desk flex h-full flex-col border-l border-desk-line bg-desk-surface">
        <header className="flex items-start justify-between gap-4 border-b border-desk-line px-6 pt-6 pb-5">
          <div>
            <h2 id={titleId} className="font-display-tight text-[1.75rem] leading-tight text-desk-text">
              {t("editor.details")}
            </h2>
            <p className="mt-1 text-sm text-desk-muted">{t("editor.detailsSub")}</p>
          </div>
          <IconButton label={t("common.close")} icon={<X size={20} aria-hidden="true" />} onClick={onClose} />
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="grid gap-5">
            <Field label={t("editor.titleLabel")} error={titleError}>
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  maxLength={LIMITS.title}
                  value={quiz.title}
                  placeholder={t("editor.titlePlaceholder")}
                  onChange={(e) => onPatch({ title: e.target.value })}
                />
              )}
            </Field>
            <Field label={t("editor.descriptionQuiz")} optional={t("editor.optional")}>
              {({ id, describedBy }) => (
                <TextArea
                  id={id}
                  aria-describedby={describedBy}
                  rows={3}
                  maxLength={LIMITS.description}
                  value={quiz.description ?? ""}
                  placeholder={t("editor.descriptionQuizPlaceholder")}
                  onChange={(e) => onPatch({ description: orUndefined(e.target.value) })}
                />
              )}
            </Field>
            <Field label={t("editor.topic")} optional={t("editor.optional")}>
              {({ id, describedBy }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  maxLength={LIMITS.shortField}
                  value={quiz.topic ?? ""}
                  placeholder={t("editor.topicPlaceholder")}
                  onChange={(e) => onPatch({ topic: orUndefined(e.target.value) })}
                />
              )}
            </Field>
          </div>

          <h3 className="mt-9 mb-4 text-[13px] font-bold text-desk-muted">{t("editor.sectionCourse")}</h3>
          <div className="grid gap-5">
            <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4">
              <Field label={t("editor.courseCode")}>
                {({ id, describedBy }) => (
                  <TextInput
                    id={id}
                    aria-describedby={describedBy}
                    maxLength={24}
                    value={quiz.course.courseCode}
                    placeholder={t("editor.courseCodePlaceholder")}
                    onChange={(e) => onPatchCourse({ courseCode: e.target.value.toUpperCase() })}
                    className="uppercase"
                  />
                )}
              </Field>
              <Field label={t("editor.className")} optional={t("editor.optional")}>
                {({ id, describedBy }) => (
                  <TextInput
                    id={id}
                    aria-describedby={describedBy}
                    maxLength={24}
                    value={quiz.course.className ?? ""}
                    placeholder={t("editor.classPlaceholder")}
                    onChange={(e) => onPatchCourse({ className: orUndefined(e.target.value.toUpperCase()) })}
                    className="uppercase"
                  />
                )}
              </Field>
            </div>
            <Field label={t("editor.courseName")}>
              {({ id, describedBy }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  maxLength={LIMITS.shortField}
                  value={quiz.course.courseName}
                  placeholder={t("editor.courseNamePlaceholder")}
                  onChange={(e) => onPatchCourse({ courseName: e.target.value })}
                />
              )}
            </Field>
            <Field label={t("editor.lecturer")} optional={t("editor.optional")}>
              {({ id, describedBy }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  maxLength={LIMITS.shortField}
                  value={quiz.course.lecturer ?? ""}
                  onChange={(e) => onPatchCourse({ lecturer: orUndefined(e.target.value) })}
                />
              )}
            </Field>
            <Field label={t("editor.learningOutcome")} optional={t("editor.optional")}>
              {({ id, describedBy }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  maxLength={LIMITS.shortField}
                  value={quiz.course.learningOutcome ?? ""}
                  placeholder={t("editor.learningOutcomePlaceholder")}
                  onChange={(e) => onPatchCourse({ learningOutcome: orUndefined(e.target.value) })}
                />
              )}
            </Field>
          </div>

          <h3 className="mt-9 mb-4 text-[13px] font-bold text-desk-muted">{t("editor.sectionPlay")}</h3>
          <div className="grid gap-5">
            <div className="grid gap-1.5">
              <p className="text-sm font-bold text-desk-text">{t("editor.difficulty")}</p>
              <Segmented
                name="quiz-difficulty"
                label={t("editor.difficulty")}
                value={quiz.difficulty}
                options={DIFFICULTIES.map((d) => ({ value: d, label: t(`editor.difficulties.${d}`) }))}
                onChange={(difficulty) => onPatch({ difficulty })}
              />
            </div>
            <div className="grid gap-1.5">
              <p className="text-sm font-bold text-desk-text">{t("common.language")}</p>
              <Segmented
                name="quiz-language"
                label={t("common.language")}
                value={quiz.language}
                options={(["id", "en"] as const).map((l) => ({ value: l, label: t(`editor.languages.${l}`) }))}
                onChange={(language) => onPatch({ language })}
              />
              <p className="text-[13px] text-desk-muted">{t("editor.languageHint")}</p>
            </div>

            <fieldset className="grid gap-2">
              <legend className="mb-1.5 text-sm font-bold text-desk-text">{t("editor.mode")}</legend>
              {GAME_MODES.map((mode) => {
                const enabled = ENABLED_GAME_MODES.includes(mode);
                const checked = quiz.mode === mode;
                return (
                  <label
                    key={mode}
                    className={cn(
                      "nf nf-sm nf-desk flex min-h-14 items-start gap-3 px-4 py-3",
                      checked &&
                        "[--nf-fill:color-mix(in_oklab,var(--binus-blue-500)_6%,white)] [--nf-stroke-w:2px] [--nf-stroke:var(--binus-blue-500)]",
                      enabled ? "cursor-pointer" : "cursor-not-allowed opacity-60",
                      "has-[:focus-visible]:[--nf-stroke-w:2px] has-[:focus-visible]:[--nf-stroke:var(--binus-blue-500)]",
                    )}
                  >
                    <input
                      type="radio"
                      name="quiz-mode"
                      value={mode}
                      checked={checked}
                      disabled={!enabled}
                      onChange={() => onPatch({ mode })}
                      className="mt-1 size-4 shrink-0 accent-binus-500"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-bold text-desk-text">{t(`editor.modes.${mode}`)}</span>
                        {!enabled && (
                          <NusaBadge tone="desk" size="sm">
                            {t("editor.comingSoon")}
                          </NusaBadge>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[13px] text-desk-muted">{t(`editor.modeHint.${mode}`)}</span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          </div>
        </div>

        <footer className="flex justify-end border-t border-desk-line px-6 py-4">
          <NusaButton variant="desk" onClick={onClose}>
            {t("editor.detailsDone")}
          </NusaButton>
        </footer>
      </div>
    </dialog>
  );
}
