/**
 * Editor state as a pure reducer: every edit is an action, so autosave can watch a
 * single revision counter and undo can snapshot before structural changes.
 *
 * Text edits are NOT pushed to the undo stack (the browser already undoes typing
 * inside a field); structural edits are: add, duplicate, delete, move, type change,
 * removing an answer or image. That is what lecturers regret.
 */

import type { AnswerOption, CourseInfo, Question, QuestionType, Quiz } from "@/lib/game/types";
import { changeQuestionType, duplicateQuestion, moveItem, newQuestion, reindex } from "@/lib/quiz/factory";

const UNDO_LIMIT = 30;

export interface EditorState {
  quiz: Quiz | null;
  /** Increments on every change; autosave compares it with the last saved revision. */
  rev: number;
  past: Quiz[];
  /** Answers a question had before becoming short-answer/numeric, restored when switching back. */
  remembered: Record<string, AnswerOption[]>;
}

export type QuizPatch = Partial<
  Pick<Quiz, "title" | "description" | "topic" | "difficulty" | "language" | "mode" | "visibility">
>;
export type QuestionUpdater = (question: Question) => Question;

export type EditorAction =
  | { type: "load"; quiz: Quiz }
  | { type: "patchQuiz"; patch: QuizPatch }
  | { type: "patchCourse"; patch: Partial<CourseInfo> }
  /** `structural` = snapshot for undo first (e.g. removing an answer row or an image). */
  | { type: "updateQuestion"; id: string; update: QuestionUpdater; structural?: boolean }
  | { type: "insertQuestion"; question: Question; afterId: string | null }
  | { type: "duplicateQuestion"; id: string; created: Question }
  | { type: "deleteQuestion"; id: string }
  | { type: "moveQuestion"; id: string; delta: -1 | 1 }
  | { type: "changeType"; id: string; questionType: QuestionType }
  | { type: "undo" };

export const initialEditorState: EditorState = { quiz: null, rev: 0, past: [], remembered: {} };

function withQuiz(state: EditorState, quiz: Quiz, structural: boolean): EditorState {
  if (!state.quiz) return state;
  return {
    ...state,
    quiz,
    rev: state.rev + 1,
    past: structural ? [...state.past, state.quiz].slice(-UNDO_LIMIT) : state.past,
  };
}

function insertAfter(questions: Question[], afterId: string | null, question: Question): Question[] {
  const index = afterId ? questions.findIndex((q) => q.id === afterId) : questions.length - 1;
  const next = [...questions];
  next.splice(index + 1, 0, question);
  return reindex(next);
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  if (action.type === "load") return { quiz: action.quiz, rev: 0, past: [], remembered: {} };
  const quiz = state.quiz;
  if (!quiz) return state;

  switch (action.type) {
    case "patchQuiz":
      return withQuiz(state, { ...quiz, ...action.patch }, false);

    case "patchCourse":
      return withQuiz(state, { ...quiz, course: { ...quiz.course, ...action.patch } }, false);

    case "updateQuestion": {
      const questions = quiz.questions.map((q) => (q.id === action.id ? action.update(q) : q));
      return withQuiz(state, { ...quiz, questions }, Boolean(action.structural));
    }

    case "insertQuestion":
      return withQuiz(
        state,
        { ...quiz, questions: insertAfter(quiz.questions, action.afterId, action.question) },
        true,
      );

    case "duplicateQuestion":
      return withQuiz(state, { ...quiz, questions: insertAfter(quiz.questions, action.id, action.created) }, true);

    case "deleteQuestion": {
      const questions = reindex(quiz.questions.filter((q) => q.id !== action.id));
      return withQuiz(state, { ...quiz, questions }, true);
    }

    case "moveQuestion": {
      const index = quiz.questions.findIndex((q) => q.id === action.id);
      const questions = moveItem(quiz.questions, index, action.delta);
      if (questions.every((q, i) => q.id === quiz.questions[i]?.id)) return state;
      return withQuiz(state, { ...quiz, questions }, true);
    }

    case "changeType": {
      const current = quiz.questions.find((q) => q.id === action.id);
      if (!current || current.type === action.questionType) return state;
      const remembered =
        current.answers.length > 0 ? { ...state.remembered, [current.id]: current.answers } : state.remembered;
      const next = changeQuestionType(current, action.questionType, {
        language: quiz.language,
        rememberedAnswers: state.remembered[current.id],
      });
      const questions = quiz.questions.map((q) => (q.id === action.id ? next : q));
      return { ...withQuiz(state, { ...quiz, questions }, true), remembered };
    }

    case "undo": {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return { ...state, quiz: previous, rev: state.rev + 1, past: state.past.slice(0, -1) };
    }
  }
}

/*
 * Action creators that need fresh ids build the new question OUTSIDE the reducer, so
 * the reducer stays pure (React may run it twice in development).
 */

export function duplicateAction(question: Question): EditorAction {
  return { type: "duplicateQuestion", id: question.id, created: duplicateQuestion(question) };
}

/** New questions inherit the timing of the one they follow: lecturers set a rhythm. */
export function addQuestionAction(
  quiz: Quiz,
  questionType: QuestionType,
  afterId: string | null,
): { action: EditorAction; question: Question } {
  const after = quiz.questions.find((q) => q.id === afterId) ?? quiz.questions.at(-1);
  const question = newQuestion(questionType, {
    language: quiz.language,
    timeLimit: after?.timeLimit,
    points: after && after.type !== "poll" ? after.points : undefined,
  });
  return { action: { type: "insertQuestion", question, afterId }, question };
}
