"use client";

import { Sparkles } from "lucide-react";
import { NusaButton } from "@/components/ui/NusaButton";
import { useT } from "@/lib/i18n/client";

/**
 * Shown on a quiz that just came out of "Generate dengan AI". It is a review
 * reminder, not an alarm: calm blue, one sentence per fact.
 */
export function AiReviewBanner({
  isMock,
  scaffolds,
  onDismiss,
}: {
  isMock: boolean;
  scaffolds: number;
  onDismiss: () => void;
}) {
  const t = useT();
  return (
    <section
      aria-labelledby="ai-review-title"
      className="flex flex-wrap items-start gap-x-4 gap-y-3 border-b border-desk-line bg-[color-mix(in_oklab,var(--binus-blue-500)_7%,var(--desk-surface))] px-4 py-3.5 sm:px-6"
    >
      <span
        className="grid size-9 shrink-0 place-items-center rounded-[8px_2px_12px_2px] bg-binus-500 text-white"
        aria-hidden="true"
      >
        <Sparkles size={18} />
      </span>
      <div className="min-w-[16rem] flex-1 text-[13.5px] leading-relaxed">
        <h2 id="ai-review-title" className="text-sm font-extrabold text-desk-text">
          {t("editor.aiReview")}
        </h2>
        <p className="text-desk-text">{t("editor.ai.disclaimer")}</p>
        {scaffolds > 0 && (
          <p className="font-semibold text-desk-text">{t("editor.ai.scaffolds", { count: scaffolds })}</p>
        )}
        {isMock && <p className="text-desk-muted">{t("editor.ai.mockNotice")}</p>}
      </div>
      <NusaButton variant="desk-quiet" size="sm" onClick={onDismiss}>
        {t("editor.aiReviewDismiss")}
      </NusaButton>
    </section>
  );
}
