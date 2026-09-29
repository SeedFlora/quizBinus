import type { Question } from "@/lib/game/types";
import type { QuestionIssue } from "@/lib/quiz/schema";

/**
 * How editor sub-components change the selected question. `structural` edits
 * (removing a row, clearing an image) are snapshotted for undo first.
 */
export type QuestionChange = (update: (question: Question) => Question, options?: { structural?: boolean }) => void;

export interface AnswerEditorProps {
  question: Question;
  onChange: QuestionChange;
  /** Issues for this question; shown inline only when `showIssues` is true. */
  issues: QuestionIssue[];
  showIssues: boolean;
}
