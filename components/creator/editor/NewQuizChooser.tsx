"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { AnswerSymbol, answerSlot } from "@/components/game/AnswerSymbol";
import { NusaButton, NusaLink } from "@/components/ui/NusaButton";
import { useCreatorStorage } from "@/components/creator/storage-context";
import { useT } from "@/lib/i18n/client";
import { createQuiz, type QuizOwner } from "./create-quiz";

/**
 * The fork on /quizzes/new. Two doors, each drawn with what's behind it: a blank
 * first question (the ghost "01"), or a stack of drafted questions to review.
 */
export function NewQuizChooser({ owner }: { owner: QuizOwner }) {
  const t = useT();
  const router = useRouter();
  const storage = useCreatorStorage();
  const [creating, setCreating] = useState(false);
  const [failed, setFailed] = useState(false);

  const startBlank = async () => {
    setCreating(true);
    setFailed(false);
    try {
      const quiz = await createQuiz(storage, owner);
      router.push(`/quizzes/${quiz.id}/edit`);
    } catch {
      setFailed(true);
      setCreating(false);
    }
  };

  return (
    <div className="grid max-w-5xl gap-5 px-5 py-8 sm:px-10 md:grid-cols-2">
      <section
        aria-labelledby="new-blank"
        className="nf nf-lg nf-desk relative flex flex-col overflow-hidden p-7 sm:p-9"
      >
        <span
          className="font-numeral pointer-events-none absolute -top-3 right-6 text-[10rem] leading-[0.8] text-desk-sunken select-none"
          aria-hidden="true"
        >
          01
        </span>
        <div className="relative flex-1">
          <h2 id="new-blank" className="font-display-tight mt-16 text-[1.75rem] leading-tight text-desk-text">
            {t("editor.new.blankTitle")}
          </h2>
          <p className="mt-2 max-w-[38ch] text-desk-muted">{t("editor.new.blankBody")}</p>
        </div>
        <div className="relative mt-8">
          <NusaButton
            variant="energy"
            size="lg"
            loading={creating}
            loadingLabel={t("editor.new.creating")}
            trailing={<ArrowRight size={18} aria-hidden="true" />}
            onClick={() => void startBlank()}
          >
            {t("editor.new.blankCta")}
          </NusaButton>
          {failed && (
            <p role="alert" className="mt-3 text-sm font-semibold text-danger">
              {t("editor.new.failed")}
            </p>
          )}
        </div>
      </section>

      <section
        aria-labelledby="new-ai"
        className="nf nf-lg nf-desk relative flex flex-col overflow-hidden p-7 [--nf-fill:color-mix(in_oklab,var(--binus-blue-500)_6%,white)] sm:p-9"
      >
        <DraftStack />
        <div className="relative flex-1">
          <h2
            id="new-ai"
            className="font-display-tight mt-6 flex items-center gap-2 text-[1.75rem] leading-tight text-desk-text"
          >
            <Sparkles size={22} className="text-binus-500" aria-hidden="true" />
            {t("creator.generateAi")}
          </h2>
          <p className="mt-2 max-w-[40ch] text-desk-muted">{t("editor.new.aiBody")}</p>
        </div>
        <div className="relative mt-8">
          <NusaLink
            href="/quizzes/new?mode=ai"
            variant="desk"
            size="lg"
            trailing={<ArrowRight size={18} aria-hidden="true" />}
          >
            {t("editor.new.aiCta")}
          </NusaLink>
        </div>
      </section>
    </div>
  );
}

/** Three drafted question rows: answer chips + text lines, the second one "being reviewed". */
function DraftStack() {
  return (
    <div className="grid gap-2" aria-hidden="true">
      {[0.78, 0.62, 0.7].map((width, row) => (
        <div
          key={row}
          className="nf nf-sm nf-desk flex h-11 items-center gap-3 px-2"
          style={{ opacity: row === 1 ? 1 : 0.55, marginLeft: row * 14 }}
        >
          <span
            className="nf grid size-7 place-items-center [--nf-br:9px] [--nf-cut:6px] [--nf-fill:var(--binus-blue-950)] [--nf-notch:3px] [--nf-tl:4px]"
            style={{ color: answerSlot(row + 1).color }}
          >
            <AnswerSymbol kind={answerSlot(row + 1).symbol} size={15} />
          </span>
          <span className="h-2 rounded-full bg-desk-line" style={{ width: `${width * 70}%` }} />
        </div>
      ))}
    </div>
  );
}
