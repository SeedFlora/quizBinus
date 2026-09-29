import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlayerQuestionView, type PlayerQuestionViewProps } from "@/components/player/views/PlayerQuestionView";
import type { AnswerPayload, PublicQuestion, QuestionType } from "@/lib/game/types";
import { answerName, renderUI, t } from "./render";

function publicQuestion(type: QuestionType, texts = ["FCFS", "Round Robin", "SJF", "Priority"]): PublicQuestion {
  return {
    id: `pq-${type}`,
    index: 2,
    total: 10,
    type,
    prompt: `Pertanyaan ${type}?`,
    timeLimit: 20,
    points: 1000,
    topic: "Scheduling",
    answers:
      type === "short_answer" || type === "numeric"
        ? []
        : texts.map((text, i) => ({ id: `a${i + 1}`, position: i, text })),
    selectCount: type === "multiple" ? 2 : undefined,
    unit: type === "numeric" ? "ms" : undefined,
  };
}

function setup(type: QuestionType, props: Partial<PlayerQuestionViewProps> = {}) {
  const onSubmit = vi.fn<(payload: AnswerPayload) => void>();
  const question = props.question ?? publicQuestion(type);
  const view = renderUI(
    <PlayerQuestionView
      question={question}
      deadlineAt={Date.now() + 20_000}
      clockOffsetMs={0}
      paused={false}
      pausedRemainingMs={null}
      submitted={null}
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return { onSubmit, question, user: userEvent.setup(), ...view };
}

const answerButtons = () => screen.getAllByRole("button").filter((b) => b.hasAttribute("data-state"));

describe("PlayerQuestionView: single choice", () => {
  it("shows the prompt and one button per answer", () => {
    setup("single");
    expect(screen.getByRole("heading", { level: 1, name: "Pertanyaan single?" })).toBeInTheDocument();
    expect(answerButtons().map((b) => b.textContent)).toHaveLength(4);
    expect(screen.getByRole("button", { name: answerName("B", "Round Robin") })).toBeEnabled();
    expect(screen.queryByRole("button", { name: t("play.lockAnswer") })).toBeNull();
  });

  it("one tap submits immediately", async () => {
    const { onSubmit, user } = setup("single");
    await user.click(screen.getByRole("button", { name: answerName("B", "Round Robin") }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ kind: "choice", answerIds: ["a2"] });
  });

  it("a rapid double tap (same frame) submits exactly once", () => {
    const { onSubmit } = setup("single");
    const b = screen.getByRole("button", { name: answerName("B", "Round Robin") });
    const c = screen.getByRole("button", { name: answerName("C", "SJF") });
    // All taps land in one batch, before React re-renders the buttons as disabled,
    // so only the synchronous ref guard can stop the second and third submission.
    act(() => {
      b.click();
      b.click();
      c.click();
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ kind: "choice", answerIds: ["a2"] });
    // and once React has caught up, the buttons are disabled as well
    fireEvent.click(c);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(c).toBeDisabled();
  });

  it("locks every answer after the tap", async () => {
    const { user } = setup("single");
    await user.click(screen.getByRole("button", { name: answerName("A", "FCFS") }));
    for (const b of answerButtons()) expect(b).toBeDisabled();
  });

  it("true/false answers use slot positions A and B", () => {
    setup("true_false", { question: publicQuestion("true_false", ["Benar", "Salah"]) });
    expect(screen.getByRole("button", { name: answerName("A", "Benar") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: answerName("B", "Salah") })).toBeInTheDocument();
  });

  it("polls are labelled as unscored and submit on tap", async () => {
    const { onSubmit, user } = setup("poll");
    expect(screen.getByText(t("play.pollLabel"))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: answerName("D", "Priority") }));
    expect(onSubmit).toHaveBeenCalledWith({ kind: "choice", answerIds: ["a4"] });
  });
});

describe("PlayerQuestionView: multiple select", () => {
  it("toggles picks (aria-pressed) without submitting; the lock button submits once", async () => {
    const { onSubmit, user } = setup("multiple");
    expect(screen.getByText(t("play.chooseMany", { count: 2 }))).toBeInTheDocument();
    const lock = screen.getByRole("button", { name: t("play.lockAnswer") });
    expect(lock).toBeDisabled();

    const a = screen.getByRole("button", { name: answerName("A", "FCFS") });
    const c = screen.getByRole("button", { name: answerName("C", "SJF") });
    await user.click(a);
    await user.click(c);
    await user.click(screen.getByRole("button", { name: answerName("D", "Priority") }));
    await user.click(screen.getByRole("button", { name: answerName("D", "Priority") })); // un-pick
    expect(a).toHaveAttribute("aria-pressed", "true");
    expect(c).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: answerName("D", "Priority") })).toHaveAttribute("aria-pressed", "false");
    expect(onSubmit).not.toHaveBeenCalled();

    expect(lock).toBeEnabled();
    fireEvent.click(lock);
    fireEvent.click(lock);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ kind: "choice", answerIds: ["a1", "a3"] });
  });

  it("the multi-select group is labelled for assistive tech", () => {
    setup("multiple");
    const group = screen.getByRole("group", { name: t("play.chooseAnswer") });
    expect(within(group).getAllByRole("button")).toHaveLength(4);
  });
});

describe("PlayerQuestionView: submitted / paused", () => {
  it("after submission (e.g. resume) everything is disabled and the pick shows as locked", () => {
    const { onSubmit } = setup("single", { submitted: { kind: "choice", answerIds: ["a3"] } });
    for (const b of answerButtons()) expect(b).toBeDisabled();
    expect(screen.getByRole("button", { name: answerName("C", "SJF") })).toHaveAttribute("data-state", "locked");
    expect(screen.getByRole("button", { name: answerName("A", "FCFS") })).toHaveAttribute("data-state", "dimmed");
    fireEvent.click(screen.getByRole("button", { name: answerName("A", "FCFS") }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("a submitted multi-select hides the lock button", () => {
    setup("multiple", { submitted: { kind: "choice", answerIds: ["a1", "a2"] } });
    expect(screen.queryByRole("button", { name: t("play.lockAnswer") })).toBeNull();
    expect(screen.getByRole("button", { name: answerName("A", "FCFS") })).toHaveAttribute("aria-pressed", "true");
  });

  it("while paused, answers are disabled and the pause is announced", () => {
    const { onSubmit } = setup("single", { paused: true, pausedRemainingMs: 8_000 });
    expect(screen.getByRole("status")).toHaveTextContent(t("play.pausedSub"));
    for (const b of answerButtons()) expect(b).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: answerName("A", "FCFS") }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("PlayerQuestionView: typed answers", () => {
  it("short answer: submits trimmed text once via the lock button", async () => {
    const { onSubmit, user } = setup("short_answer");
    const input = screen.getByLabelText(t("play.typeAnswer"));
    const lock = screen.getByRole("button", { name: t("play.lockAnswer") });
    expect(lock).toBeDisabled();
    await user.type(input, "  Round Robin  ");
    await user.click(lock);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ kind: "text", value: "Round Robin" });
  });

  it("short answer: Enter submits too", async () => {
    const { onSubmit, user } = setup("short_answer");
    await user.type(screen.getByLabelText(t("play.typeAnswer")), "RR{Enter}");
    expect(onSubmit).toHaveBeenCalledWith({ kind: "text", value: "RR" });
  });

  it("numeric: accepts a decimal comma and shows the unit", async () => {
    const { onSubmit, user } = setup("numeric");
    expect(screen.getByText("ms")).toBeInTheDocument();
    const input = screen.getByLabelText(t("play.numberAnswer"));
    expect(input).toHaveAttribute("inputmode", "decimal");
    await user.type(input, "3,5{Enter}");
    expect(onSubmit).toHaveBeenCalledWith({ kind: "number", value: 3.5 });
  });

  it("numeric: ignores input that is not a number", async () => {
    const { onSubmit, user } = setup("numeric");
    await user.type(screen.getByLabelText(t("play.numberAnswer")), "abc{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows the submitted value read-only after resume", () => {
    setup("numeric", { submitted: { kind: "number", value: 42 } });
    expect(screen.getByLabelText(t("play.numberAnswer"))).toHaveValue("42");
    expect(screen.getByLabelText(t("play.numberAnswer"))).toBeDisabled();
    expect(screen.queryByRole("button", { name: t("play.lockAnswer") })).toBeNull();
  });
});

describe("PlayerQuestionView: ordering", () => {
  it("builds the order by tapping and locks it once complete", async () => {
    const { onSubmit, user } = setup("ordering", { question: publicQuestion("ordering", ["Ready", "New", "Running"]) });
    const lock = screen.getByRole("button", { name: t("play.lockAnswer") });
    await user.click(screen.getByRole("button", { name: "New" }));
    await user.click(screen.getByRole("button", { name: "Ready" }));
    expect(lock).toBeDisabled(); // one left
    await user.click(screen.getByRole("button", { name: "Running" }));
    expect(lock).toBeEnabled();
    await user.click(lock);
    expect(onSubmit).toHaveBeenCalledWith({ kind: "order", answerIds: ["a2", "a1", "a3"] });
  });

  it("reset clears the order", async () => {
    const { user } = setup("ordering", { question: publicQuestion("ordering", ["Ready", "New", "Running"]) });
    const reset = screen.getByRole("button", { name: t("play.resetOrder") });
    expect(reset).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "New" }));
    expect(screen.getByRole("listitem")).toHaveTextContent("New");
    await user.click(reset);
    expect(screen.queryByRole("listitem")).toBeNull();
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
  });
});
