import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HostControls } from "@/components/host/HostControls";
import { renderUI, t } from "./render";

function setup(overrides: Partial<Parameters<typeof HostControls>[0]> = {}) {
  const handlers = {
    onPauseToggle: vi.fn(),
    onSkip: vi.fn(),
    onEnd: vi.fn(),
    onFullscreen: vi.fn(),
    onMute: vi.fn(),
    onToggleLeaderboard: vi.fn(),
  };
  const run = vi.fn();
  renderUI(
    <HostControls
      primary={{ label: t("host.showResults"), run }}
      paused={false}
      canPause
      canSkip
      showLeaderboard
      fullscreen={false}
      muted={false}
      {...handlers}
      {...overrides}
    />,
  );
  return {
    ...handlers,
    run,
    user: userEvent.setup(),
    toolbar: screen.getByRole("toolbar", { name: t("host.controls") }),
  };
}

describe("HostControls", () => {
  it("renders one labelled primary action that runs on click", async () => {
    const { run, user, toolbar } = setup();
    const primary = within(toolbar).getByRole("button", { name: t("host.showResults") });
    await user.click(primary);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("shows no primary button when there is no primary action", () => {
    const { toolbar } = setup({ primary: null });
    expect(within(toolbar).queryByRole("button", { name: t("host.showResults") })).toBeNull();
  });

  it("marks the primary action busy while a command is in flight", () => {
    const { toolbar } = setup({ busy: true });
    expect(within(toolbar).getByRole("button", { name: t("host.showResults") })).toHaveAttribute("aria-busy", "true");
  });

  it("every utility is a named button wired to its handler", async () => {
    const h = setup();
    await h.user.click(screen.getByRole("button", { name: t("host.pause") }));
    await h.user.click(screen.getByRole("button", { name: t("host.skip") }));
    await h.user.click(screen.getByRole("button", { name: t("host.hideLeaderboard") }));
    await h.user.click(screen.getByRole("button", { name: t("common.mute") }));
    await h.user.click(screen.getByRole("button", { name: t("host.fullscreen") }));
    await h.user.click(screen.getByRole("button", { name: t("host.end") }));
    expect(h.onPauseToggle).toHaveBeenCalledTimes(1);
    expect(h.onSkip).toHaveBeenCalledTimes(1);
    expect(h.onToggleLeaderboard).toHaveBeenCalledTimes(1);
    expect(h.onMute).toHaveBeenCalledTimes(1);
    expect(h.onFullscreen).toHaveBeenCalledTimes(1);
    expect(h.onEnd).toHaveBeenCalledTimes(1);
    expect(h.run).not.toHaveBeenCalled();
  });

  it("pause flips to resume when paused", () => {
    setup({ paused: true });
    expect(screen.getByRole("button", { name: t("host.resume") })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("host.pause") })).toBeNull();
  });

  it("hides pause and skip when they do not apply", () => {
    setup({ canPause: false, canSkip: false });
    expect(screen.queryByRole("button", { name: t("host.pause") })).toBeNull();
    expect(screen.queryByRole("button", { name: t("host.skip") })).toBeNull();
    // ending is always possible
    expect(screen.getByRole("button", { name: t("host.end") })).toBeInTheDocument();
  });

  it("toggle buttons expose their pressed state", () => {
    setup({ showLeaderboard: false, muted: true });
    expect(screen.getByRole("button", { name: t("host.showLeaderboard") })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: t("common.unmute") })).toHaveAttribute("aria-pressed", "true");
  });

  it("utilities are reachable by keyboard in a sensible order", async () => {
    const { user } = setup();
    await user.tab();
    expect(screen.getByRole("button", { name: t("host.pause") })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: t("host.skip") })).toHaveFocus();
  });
});
