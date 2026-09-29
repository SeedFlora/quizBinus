"use client";

import { useState } from "react";
import { Field, Segmented, Select, Switch, TextArea, TextInput } from "@/components/ui/desk/Field";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { NusaButton } from "@/components/ui/NusaButton";
import { TIME_LIMITS, DIFFICULTIES, type Difficulty } from "@/lib/game/types";
import { useT } from "@/lib/i18n/client";
import { DeskPlate } from "./Controls";
import { Specimen, Subhead } from "../primitives";

export function DeskSection() {
  const t = useT();
  const [timer, setTimer] = useState<number>(20);
  const [difficulty, setDifficulty] = useState<Difficulty>("sedang");
  const [reduced, setReduced] = useState(false);
  const [dialog, setDialog] = useState<"stage" | "desk" | null>(null);

  return (
    <div className="grid gap-8">
      <DeskPlate>
        <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
          <Field label={t("editor.questionPrompt")} hint={t("editor.questionPromptPlaceholder")}>
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                defaultValue="Algoritma scheduling mana yang menggunakan time quantum?"
              />
            )}
          </Field>
          <Field label={t("editor.questionPrompt")} error={t("editor.validation.promptRequired")}>
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                placeholder={t("editor.questionPromptPlaceholder")}
              />
            )}
          </Field>
          <Field label={t("editor.courseCode")} hint={t("design.states.disabled")}>
            {({ id, describedBy }) => (
              <TextInput id={id} aria-describedby={describedBy} defaultValue="COMP6716" disabled />
            )}
          </Field>
          <Field label={t("editor.type")}>
            {({ id }) => (
              <Select id={id} defaultValue="single">
                {(["single", "multiple", "true_false", "short_answer", "poll", "ordering", "numeric"] as const).map(
                  (type) => (
                    <option key={type} value={type}>
                      {t(`editor.types.${type}`)}
                    </option>
                  ),
                )}
              </Select>
            )}
          </Field>
          <Field label={t("editor.explanation")} className="md:col-span-2">
            {({ id }) => <TextArea id={id} placeholder={t("editor.explanationPlaceholder")} />}
          </Field>
          <div className="grid gap-2">
            <p className="text-sm font-bold text-desk-text">{t("editor.timer")}</p>
            <Segmented
              name="gallery-timer"
              label={t("editor.timer")}
              value={timer}
              onChange={setTimer}
              size="sm"
              options={TIME_LIMITS.slice(0, 6).map((s) => ({ value: s, label: `${s}${t("common.secondsShort")}` }))}
            />
          </div>
          <div className="grid gap-2">
            <p className="text-sm font-bold text-desk-text">{t("editor.difficulty")}</p>
            <Segmented
              name="gallery-difficulty"
              label={t("editor.difficulty")}
              value={difficulty}
              onChange={setDifficulty}
              options={DIFFICULTIES.map((d) => ({ value: d, label: t(`editor.difficulties.${d}`) }))}
            />
          </div>
          <div className="md:col-span-2">
            <Switch
              checked={reduced}
              onChange={setReduced}
              label={t("settings.reducedMotion")}
              description={t("settings.reducedMotionHint")}
            />
          </div>
        </div>
      </DeskPlate>

      <div>
        <Subhead>ConfirmDialog</Subhead>
        <div className="flex flex-wrap gap-6">
          <Specimen label={t("design.labels.stage")}>
            <NusaButton variant="ghost" onClick={() => setDialog("stage")}>
              {t("design.labels.openDialog")}
            </NusaButton>
          </Specimen>
          <Specimen label={t("design.labels.desk")}>
            <NusaButton variant="kapas" onClick={() => setDialog("desk")}>
              {t("design.labels.openDialog")}
            </NusaButton>
          </Specimen>
        </div>
      </div>

      <ConfirmDialog
        open={dialog !== null}
        surface={dialog === "desk" ? "desk" : "stage"}
        title={t("host.endConfirmTitle")}
        body={t("host.endConfirmBody")}
        confirmLabel={t("host.endConfirmCta")}
        tone="danger"
        onCancel={() => setDialog(null)}
        onConfirm={() => setDialog(null)}
      />
    </div>
  );
}
