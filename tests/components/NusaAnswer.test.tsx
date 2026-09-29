import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NusaAnswer, type AnswerState } from "@/components/game/NusaAnswer";
import { answerName, renderUI } from "./render";

describe("NusaAnswer", () => {
  it("is a button named by letter + text (colour and symbol are never the only signal)", () => {
    renderUI(<NusaAnswer position={1} text="Round Robin" />);
    const button = screen.getByRole("button", { name: answerName("B", "Round Robin") });
    expect(button).toHaveAttribute("data-slot", "1");
    expect(button).toHaveAttribute("data-state", "idle");
    expect(button).toHaveAttribute("type", "button");
    // single-tap answers are not toggles
    expect(button).not.toHaveAttribute("aria-pressed");
  });

  it("wraps positions beyond four onto the four slots", () => {
    renderUI(<NusaAnswer position={5} text="Monitor" />);
    expect(screen.getByRole("button", { name: answerName("B", "Monitor") })).toHaveAttribute("data-slot", "1");
  });

  it.each<AnswerState>(["idle", "selected", "locked", "correct", "wrong-pick", "dimmed"])(
    "exposes state %s as data-state",
    (state) => {
      renderUI(<NusaAnswer position={0} text="FCFS" state={state} />);
      expect(screen.getByRole("button")).toHaveAttribute("data-state", state);
    },
  );

  it("multi-select answers are toggles: aria-pressed follows the state", () => {
    const { rerender } = renderUI(<NusaAnswer position={0} text="Mutex" multi state="idle" />);
    expect(screen.getByRole("button", { name: answerName("A", "Mutex") })).toHaveAttribute("aria-pressed", "false");
    rerender(<NusaAnswer position={0} text="Mutex" multi state="selected" />);
    expect(screen.getByRole("button", { name: answerName("A", "Mutex") })).toHaveAttribute("aria-pressed", "true");
    rerender(<NusaAnswer position={0} text="Mutex" multi state="locked" />);
    expect(screen.getByRole("button", { name: answerName("A", "Mutex") })).toHaveAttribute("aria-pressed", "true");
    rerender(<NusaAnswer position={0} text="Mutex" multi state="dimmed" />);
    expect(screen.getByRole("button", { name: answerName("A", "Mutex") })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onSelect on click and keyboard activation", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderUI(<NusaAnswer position={2} text="SJF" onSelect={onSelect} />);
    const button = screen.getByRole("button", { name: answerName("C", "SJF") });
    await user.click(button);
    button.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onSelect).toHaveBeenCalledTimes(3);
  });

  it("does not fire when disabled", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderUI(<NusaAnswer position={3} text="Priority" disabled onSelect={onSelect} />);
    const button = screen.getByRole("button", { name: answerName("D", "Priority") });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("host (static) variant is not interactive and shows the vote count", () => {
    renderUI(<NusaAnswer position={0} text="FCFS" static size="host" state="correct" share={0.5} count={21} />);
    expect(screen.queryByRole("button")).toBeNull();
    const bar = screen.getByText("FCFS").closest("[data-state]");
    expect(bar).toHaveAttribute("data-state", "correct");
    expect(bar).toHaveAttribute("data-size", "host");
    expect(screen.getByText("21")).toBeInTheDocument();
  });

  it("renders extra status text", () => {
    renderUI(<NusaAnswer position={0} text="FCFS" state="locked" status="Pilihanmu" />);
    expect(screen.getByRole("button", { name: /Pilihanmu/ })).toHaveAttribute("data-state", "locked");
  });
});
