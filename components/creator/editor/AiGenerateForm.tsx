"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Info, Sparkles } from "lucide-react";
import { Field, Segmented, Select, TextArea, TextInput } from "@/components/ui/desk/Field";
import { NusaButton } from "@/components/ui/NusaButton";
import {
  GENERATION_COUNTS,
  GENERATION_TYPES,
  GenerationRequestSchema,
  getQuizGenerationProvider,
  type GenerationType,
} from "@/lib/ai";
import { DIFFICULTIES, type Difficulty } from "@/lib/game/types";
import { useCreatorStorage } from "@/components/creator/storage-context";
import { useI18n } from "@/lib/i18n/client";
import { createQuiz, type QuizOwner } from "./create-quiz";
import { TYPE_LABEL_KEYS } from "./question-types";

/**
 * "Generate dengan AI": describe the topic, get a draft, review it in the editor.
 * Whatever the provider, the lecturer is told plainly that drafts need review, and
 * when no real provider is connected, that the sample generator wrote this one.
 */
export function AiGenerateForm({ owner }: { owner: QuizOwner }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const storage = useCreatorStorage();
  const provider = getQuizGenerationProvider();
  const [topic, setTopic] = useState("");
  const [objective, setObjective] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("sedang");
  const [count, setCount] = useState<number>(10);
  const [language, setLanguage] = useState<"id" | "en">(locale);
  const [questionType, setQuestionType] = useState<GenerationType>("mixed");
  const [topicError, setTopicError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const topicRef = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = GenerationRequestSchema.safeParse({ topic, objective, difficulty, count, language, questionType });
    if (!parsed.success) {
      setTopicError(true);
      topicRef.current?.focus();
      return;
    }
    setBusy(true);
    setFailed(false);
    abort.current = new AbortController();
    try {
      const { draft, scaffolds } = await provider.generate(parsed.data, { signal: abort.current.signal });
      const quiz = await createQuiz(storage, owner, {
        title: draft.title,
        description: draft.description,
        topic: draft.topic,
        difficulty,
        language,
        questions: draft.questions,
      });
      router.push(`/quizzes/${quiz.id}/edit?from=ai${scaffolds > 0 ? `&scaffolds=${scaffolds}` : ""}`);
    } catch {
      if (abort.current?.signal.aborted) return;
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    // Container queries: the creator rail takes 248px from lg up, so the viewport says
    // little about the room this form really has.
    <div className="@container">
      <div className="grid max-w-6xl gap-8 px-5 py-8 sm:px-10 @4xl:grid-cols-[minmax(0,1fr)_300px] @4xl:gap-12">
        <form
          onSubmit={submit}
          noValidate
          className="nf nf-lg nf-desk grid content-start gap-6 p-6 sm:p-8"
          aria-busy={busy}
        >
          {provider.info.isMock && (
            <p className="flex items-start gap-2.5 rounded-[8px_2px_12px_2px] bg-[color-mix(in_oklab,var(--binus-blue-500)_8%,white)] px-4 py-3 text-[13.5px] leading-relaxed text-desk-text">
              <Info size={17} className="mt-0.5 shrink-0 text-binus-500" aria-hidden="true" />
              {t("editor.ai.mockNotice")}
            </p>
          )}

          <Field
            label={t("editor.ai.topic")}
            hint={t("editor.ai.topicHint")}
            error={topicError ? t("editor.ai.topicError") : undefined}
          >
            {({ id, describedBy, invalid }) => (
              <TextInput
                ref={topicRef}
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                required
                maxLength={120}
                autoFocus
                value={topic}
                placeholder={t("editor.ai.topicPlaceholder")}
                onChange={(e) => {
                  setTopic(e.target.value);
                  if (topicError && e.target.value.trim().length >= 2) setTopicError(false);
                }}
                className="text-lg! font-semibold"
              />
            )}
          </Field>

          <Field label={t("editor.ai.objective")} optional={t("editor.optional")}>
            {({ id, describedBy }) => (
              <TextArea
                id={id}
                aria-describedby={describedBy}
                rows={3}
                maxLength={300}
                value={objective}
                placeholder={t("editor.ai.objectivePlaceholder")}
                onChange={(e) => setObjective(e.target.value)}
              />
            )}
          </Field>

          <div className="@container">
            <div className="grid gap-6 @min-[500px]:grid-cols-2">
              <div className="grid content-start gap-1.5">
                <p className="text-sm font-bold text-desk-text">{t("editor.ai.difficulty")}</p>
                <Segmented
                  name="ai-difficulty"
                  label={t("editor.ai.difficulty")}
                  value={difficulty}
                  options={DIFFICULTIES.map((d) => ({ value: d, label: t(`editor.difficulties.${d}`) }))}
                  onChange={setDifficulty}
                />
              </div>
              <div className="grid content-start gap-1.5">
                <p className="text-sm font-bold text-desk-text">{t("editor.ai.count")}</p>
                <Segmented
                  name="ai-count"
                  label={t("editor.ai.count")}
                  value={count}
                  options={GENERATION_COUNTS.map((c) => ({
                    value: c as number,
                    label: <span className="tabular">{c}</span>,
                  }))}
                  onChange={setCount}
                />
              </div>
              <div className="grid content-start gap-1.5">
                <p className="text-sm font-bold text-desk-text">{t("editor.ai.language")}</p>
                <Segmented
                  name="ai-language"
                  label={t("editor.ai.language")}
                  value={language}
                  options={(["id", "en"] as const).map((l) => ({ value: l, label: t(`editor.languages.${l}`) }))}
                  onChange={setLanguage}
                />
              </div>
              <Field label={t("editor.ai.type")}>
                {({ id, describedBy }) => (
                  <Select
                    id={id}
                    aria-describedby={describedBy}
                    value={questionType}
                    onChange={(e) => setQuestionType(e.target.value as GenerationType)}
                  >
                    {GENERATION_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type === "mixed" ? t("editor.ai.mixed") : t(TYPE_LABEL_KEYS[type])}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-desk-line pt-6">
            <NusaButton
              type="submit"
              variant="energy"
              size="lg"
              loading={busy}
              loadingLabel={t("editor.ai.generating")}
              icon={<Sparkles size={18} aria-hidden="true" />}
            >
              {t("editor.ai.generate")}
            </NusaButton>
            <p className="max-w-[36ch] text-[13px] leading-snug text-desk-muted">{t("editor.ai.disclaimer")}</p>
            {failed && (
              <p role="alert" className="w-full text-sm font-semibold text-danger">
                {t("editor.ai.failed")}
              </p>
            )}
          </div>
        </form>

        <aside aria-labelledby="ai-how" className="@4xl:pt-2">
          <h2 id="ai-how" className="text-[13px] font-bold text-desk-muted">
            {t("editor.ai.howTitle")}
          </h2>
          {/* Under the form (narrow) the three steps read as one row; beside it, as a column. */}
          <ol className="mt-4 grid gap-5 @2xl:grid-cols-3 @4xl:grid-cols-1">
            {(["how1", "how2", "how3"] as const).map((key, i) => (
              <li key={key} className="grid grid-cols-[3rem_minmax(0,1fr)] items-start gap-3">
                <span className="font-numeral text-5xl leading-[0.8] text-binus-500" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="pt-0.5 text-sm leading-relaxed text-desk-text">{t(`editor.ai.${key}`)}</p>
              </li>
            ))}
          </ol>
          <p className="mt-8 border-t border-desk-line pt-4 text-[12.5px] text-desk-faint">
            {t("editor.ai.provider", { name: provider.info.isMock ? t("editor.ai.mockLabel") : provider.info.label })}
          </p>
        </aside>
      </div>
    </div>
  );
}
