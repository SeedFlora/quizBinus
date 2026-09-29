import {
  ChartNoAxesColumn,
  CircleDot,
  Cloud,
  Crosshair,
  Hash,
  Link2,
  ListChecks,
  ListOrdered,
  TextCursorInput,
  ToggleRight,
  type LucideIcon,
} from "lucide-react";
import { FUTURE_QUESTION_TYPES, QUESTION_TYPES, type FutureQuestionType, type QuestionType } from "@/lib/game/types";
import type { TranslationKey } from "@/lib/i18n/config";

/** One icon per type, used in the navigator, the add menu and the type select. */
export const TYPE_ICONS: Record<QuestionType | FutureQuestionType, LucideIcon> = {
  single: CircleDot,
  multiple: ListChecks,
  true_false: ToggleRight,
  short_answer: TextCursorInput,
  poll: ChartNoAxesColumn,
  ordering: ListOrdered,
  numeric: Hash,
  image_hotspot: Crosshair,
  word_cloud: Cloud,
  matching: Link2,
};

export const TYPE_LABEL_KEYS: Record<QuestionType | FutureQuestionType, TranslationKey> = {
  single: "editor.types.single",
  multiple: "editor.types.multiple",
  true_false: "editor.types.true_false",
  short_answer: "editor.types.short_answer",
  poll: "editor.types.poll",
  ordering: "editor.types.ordering",
  numeric: "editor.types.numeric",
  image_hotspot: "editor.types.image_hotspot",
  word_cloud: "editor.types.word_cloud",
  matching: "editor.types.matching",
};

export const TYPE_HINT_KEYS: Record<QuestionType, TranslationKey> = {
  single: "editor.typeHints.single",
  multiple: "editor.typeHints.multiple",
  true_false: "editor.typeHints.true_false",
  short_answer: "editor.typeHints.short_answer",
  poll: "editor.typeHints.poll",
  ordering: "editor.typeHints.ordering",
  numeric: "editor.typeHints.numeric",
};

export const PLAYABLE_TYPES = QUESTION_TYPES;
export const FUTURE_TYPES = FUTURE_QUESTION_TYPES;

export function isQuestionType(value: string): value is QuestionType {
  return (QUESTION_TYPES as readonly string[]).includes(value);
}
