import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { renderUI, t } from "./render";

function setup(open = true) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const props = {
    title: t("host.endConfirmTitle"),
    body: t("host.endConfirmBody"),
    confirmLabel: t("host.endConfirmCta"),
    tone: "danger" as const,
    onConfirm,
    onCancel,
  };
  const view = renderUI(<ConfirmDialog open={open} {...props} />);
  return { onConfirm, onCancel, props, user: userEvent.setup(), ...view };
}

describe("ConfirmDialog", () => {
  it("opens as a modal dialog labelled by its title", () => {
    setup();
    const dialog = screen.getByRole("dialog", { name: t("host.endConfirmTitle") });
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveTextContent(t("host.endConfirmBody"));
    expect(screen.getByRole("button", { name: t("common.cancel") })).toBeInTheDocument();
  });

  it("is closed (and inaccessible) when open is false", () => {
    setup(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("focuses the safe choice (cancel) first", () => {
    setup();
    expect(screen.getByRole("button", { name: t("common.cancel") })).toHaveFocus();
  });

  it("Escape cancels without confirming", async () => {
    const { onCancel, onConfirm, user } = setup();
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    // the component, not the platform, decides when to close (it stays open until `open` flips)
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
  });

  it("confirm and cancel buttons call their handlers", async () => {
    const { onCancel, onConfirm, user } = setup();
    await user.click(screen.getByRole("button", { name: t("host.endConfirmCta") }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: t("common.cancel") }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("closes when the parent flips open to false, and reopens", () => {
    const { rerender, props } = setup();
    rerender(<ConfirmDialog open={false} {...props} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<ConfirmDialog open {...props} />);
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
  });

  it("uses a custom cancel label when given", () => {
    renderUI(
      <ConfirmDialog
        open
        title="Hapus kuis?"
        confirmLabel="Hapus"
        cancelLabel="Jangan"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Jangan" })).toBeInTheDocument();
  });
});
