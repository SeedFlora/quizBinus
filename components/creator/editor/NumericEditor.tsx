"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Field, TextInput } from "@/components/ui/desk/Field";
import type { NumericSpec } from "@/lib/game/types";
import { useI18n } from "@/lib/i18n/client";
import type { AnswerEditorProps } from "./types";

/** Accepts "3,5" and "3.5" alike: Indonesian decimals use a comma. */
function parseDecimal(text: string): number | null {
  const cleaned = text.trim().replace(/\s/g, "").replace(",", ".");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Numeric answer: value, tolerance and unit, with a live sentence showing exactly
 * which answers the engine will accept.
 */
export function NumericEditor({ question, onChange, issues, showIssues }: AnswerEditorProps) {
  const { t, locale } = useI18n();
  const spec = question.numeric;
  // Raw strings so half-typed input ("-", "3,") never gets rewritten under the cursor.
  const [valueText, setValueText] = useState(spec ? String(spec.value).replace(".", locale === "id" ? "," : ".") : "");
  const [toleranceText, setToleranceText] = useState(
    spec ? String(spec.tolerance).replace(".", locale === "id" ? "," : ".") : "0",
  );
  const [unit, setUnit] = useState(spec?.unit ?? "");
  const issue = showIssues ? issues.find((i) => i.field === "numeric") : undefined;

  const commit = (next: { value?: string; tolerance?: string; unit?: string }) => {
    const v = parseDecimal(next.value ?? valueText);
    const tol = Math.abs(parseDecimal(next.tolerance ?? toleranceText) ?? 0);
    const u = (next.unit ?? unit).trim();
    const numeric: NumericSpec | undefined =
      v === null ? undefined : { value: v, tolerance: tol, unit: u || undefined };
    onChange((q) => ({ ...q, numeric }));
  };

  const format = (n: number) =>
    new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-GB", { maximumFractionDigits: 6 }).format(n);
  const suffix = spec?.unit ? ` ${spec.unit}` : "";

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 @min-[480px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)]">
        <Field
          className="content-start"
          label={t("editor.numericValue")}
          error={issue ? t(`editor.validation.${issue.code}`) : undefined}
        >
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              inputMode="decimal"
              autoComplete="off"
              value={valueText}
              onChange={(e) => {
                setValueText(e.target.value);
                commit({ value: e.target.value });
              }}
              className="font-numeral text-2xl!"
            />
          )}
        </Field>
        <Field className="content-start" label={t("editor.numericTolerance")} hint={t("editor.numericToleranceHint")}>
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              inputMode="decimal"
              autoComplete="off"
              value={toleranceText}
              onChange={(e) => {
                setToleranceText(e.target.value);
                commit({ tolerance: e.target.value });
              }}
              className="font-numeral text-2xl!"
            />
          )}
        </Field>
        <Field className="content-start" label={t("editor.numericUnit")} optional={t("editor.optional")}>
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              maxLength={24}
              placeholder={t("editor.numericUnitPlaceholder")}
              value={unit}
              onChange={(e) => {
                setUnit(e.target.value);
                commit({ unit: e.target.value });
              }}
            />
          )}
        </Field>
      </div>

      <p className="mt-3 flex min-h-5 items-center gap-2 text-sm font-semibold text-desk-text" aria-live="polite">
        {spec && (
          <>
            <Check size={16} className="text-success" strokeWidth={3} aria-hidden="true" />
            {spec.tolerance > 0
              ? t("editor.numericRange", {
                  min: format(spec.value - spec.tolerance) + suffix,
                  max: format(spec.value + spec.tolerance) + suffix,
                })
              : t("editor.numericExact", { value: format(spec.value) + suffix })}
          </>
        )}
      </p>
    </div>
  );
}
