import { describe, expect, it } from "vitest";
import {
  addQuestionAction,
  editorReducer,
  initialEditorState,
  type EditorAction,
  type EditorState,
} from "@/components/creator/editor/editor-state";
import { newQuiz } from "@/lib/quiz/factory";
import { question } from "../../fixtures/quiz";

function loaded(): EditorState {
  const quiz = newQuiz({
    ownerId: "u1",
    title: "OS",
    questions: [question("single", { id: "q1" }), question("true_false", { id: "q2" }), question("poll", { id: "q3" })],
  });
  return editorReducer(initialEditorState, { type: "load", quiz });
}

const run = (state: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, state);
const ids = (state: EditorState) => state.quiz!.questions.map((q) => q.id);

describe("editorReducer", () => {
  it("a freshly loaded quiz counts as saved (rev 0) with nothing to undo", () => {
    const state = loaded();
    expect(state.rev).toBe(0);
    expect(state.past).toEqual([]);
  });

  it("text edits bump the revision without filling the undo stack", () => {
    const state = run(
      loaded(),
      { type: "patchQuiz", patch: { title: "OS Battle" } },
      { type: "updateQuestion", id: "q1", update: (q) => ({ ...q, prompt: "Baru" }) },
    );
    expect(state.rev).toBe(2);
    expect(state.past).toHaveLength(0);
    expect(state.quiz!.title).toBe("OS Battle");
  });

  it("structural edits can be undone, in order", () => {
    const start = loaded();
    const state = run(start, { type: "deleteQuestion", id: "q2" }, { type: "moveQuestion", id: "q3", delta: -1 });
    expect(ids(state)).toEqual(["q3", "q1"]);
    expect(state.quiz!.questions.map((q) => q.position)).toEqual([0, 1]);

    const once = editorReducer(state, { type: "undo" });
    expect(ids(once)).toEqual(["q1", "q3"]);
    const twice = editorReducer(once, { type: "undo" });
    expect(twice.quiz).toBe(start.quiz);
    // Undo is itself a change the autosave must persist.
    expect(twice.rev).toBeGreaterThan(state.rev);
  });

  it("moving past an edge changes nothing (no revision, no undo entry)", () => {
    const state = loaded();
    expect(editorReducer(state, { type: "moveQuestion", id: "q1", delta: -1 })).toBe(state);
  });

  it("remembers choices across a round trip through a typed-answer type", () => {
    const start = loaded();
    const original = start.quiz!.questions[0]!.answers.map((a) => a.text);
    const state = run(
      start,
      { type: "changeType", id: "q1", questionType: "short_answer" },
      { type: "changeType", id: "q1", questionType: "single" },
    );
    expect(state.quiz!.questions[0]!.answers.map((a) => a.text)).toEqual(original);
  });

  it("new questions go right after the current one and inherit its timing", () => {
    const start = run(loaded(), {
      type: "updateQuestion",
      id: "q1",
      update: (q) => ({ ...q, timeLimit: 45, points: 2000 }),
    });
    const { action, question: created } = addQuestionAction(start.quiz!, "multiple", "q1");
    const state = editorReducer(start, action);
    expect(ids(state)).toEqual(["q1", created.id, "q2", "q3"]);
    expect(created).toMatchObject({ timeLimit: 45, points: 2000, type: "multiple" });
  });

  it("a question added after a poll still scores", () => {
    const start = loaded();
    const { question: created } = addQuestionAction(start.quiz!, "single", "q3");
    expect(created.points).toBeGreaterThan(0);
  });
});
