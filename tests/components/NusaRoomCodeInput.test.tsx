import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { NusaRoomCodeInput } from "@/components/game/NusaRoomCode";
import { renderUI } from "./render";

/** Controlled like JoinScreen does it. */
function Harness({
  onComplete,
  error,
  initial = "",
}: {
  onComplete?: (v: string) => void;
  error?: string;
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <NusaRoomCodeInput
      value={value}
      onChange={setValue}
      onComplete={onComplete}
      label="Kode permainan"
      hint="6 digit dari layar dosen"
      error={error}
    />
  );
}

const input = () => screen.getByLabelText("Kode permainan");

describe("NusaRoomCodeInput", () => {
  it("is one labelled numeric input with the hint as its description", () => {
    renderUI(<Harness />);
    expect(input()).toHaveAttribute("inputmode", "numeric");
    expect(input()).toHaveAttribute("autocomplete", "one-time-code");
    expect(input()).toHaveAttribute("maxlength", "6");
    expect(input()).toHaveAccessibleDescription("6 digit dari layar dosen");
    expect(input()).toHaveAttribute("aria-invalid", "false");
  });

  it("keeps digits only", async () => {
    const user = userEvent.setup();
    renderUI(<Harness />);
    await user.type(input(), "4a8-2 9");
    expect(input()).toHaveValue("4829");
  });

  it("caps pasted codes at 6 digits and normalises spacing", () => {
    renderUI(<Harness />);
    fireEvent.change(input(), { target: { value: "482 913 77" } });
    expect(input()).toHaveValue("482913");
  });

  it("calls onComplete exactly when the sixth digit arrives", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    renderUI(<Harness onComplete={onComplete} />);
    await user.type(input(), "48291");
    expect(onComplete).not.toHaveBeenCalled();
    await user.type(input(), "3");
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith("482913");
  });

  it("completes on paste of a full code", () => {
    const onComplete = vi.fn();
    renderUI(<Harness onComplete={onComplete} />);
    fireEvent.change(input(), { target: { value: "482913" } });
    expect(onComplete).toHaveBeenCalledWith("482913");
  });

  it("renders one decorative cell per digit", () => {
    const { container } = renderUI(<Harness initial="482" />);
    const cells = container.querySelector("[aria-hidden='true'].grid")!;
    expect(cells.children).toHaveLength(6);
    expect(cells.textContent).toBe("482");
  });

  it("announces errors and marks the input invalid", () => {
    renderUI(<Harness error="Kode tidak ditemukan" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Kode tidak ditemukan");
    expect(input()).toHaveAttribute("aria-invalid", "true");
    expect(input()).toHaveAccessibleDescription("Kode tidak ditemukan");
  });
});
