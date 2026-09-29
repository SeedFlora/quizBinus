import type { Translator } from "@/lib/i18n/config";

/** "Soal 4 (Round Robin)", or "Soal 4" when the question has no topic. */
export function questionLabel(t: Translator, number: number, topic: string | null): string {
  return topic ? t("analytics.questionLabelTopic", { n: number, topic }) : t("analytics.questionLabel", { n: number });
}

/** DOM id of a question's row in the distribution ledger (highlights and the chart link to it). */
export const questionAnchor = (questionId: string) => `soal-${questionId}`;
