import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreatorShell } from "@/components/creator/CreatorShell";
import { useCreatorStorage } from "@/components/creator/storage-context";
import { renderUI, t } from "./render";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

const lecturer = { name: "Laras Wicaksono", salutation: "Bu", email: "laras@binus.ac.id" };

function StorageProbe() {
  return <p data-testid="storage">{useCreatorStorage()}</p>;
}

describe("CreatorShell", () => {
  it("database mode: offers sign-out as a plain POST form and links Analytics to the latest class", () => {
    const { container } = renderUI(
      <CreatorShell lecturer={lecturer} storage="database">
        <StorageProbe />
      </CreatorShell>,
    );
    expect(screen.getByTestId("storage")).toHaveTextContent("database");
    const forms = container.querySelectorAll('form[action="/auth/signout"][method="post"]');
    // One in the desktop rail, one icon button in the mobile top bar.
    expect(forms).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: t("creator.signOut") })).toHaveLength(2);
    expect(screen.getByRole("link", { name: t("creator.nav.analytics") })).toHaveAttribute("href", "/analytics");
    expect(screen.getByText("Bu Laras Wicaksono")).toBeInTheDocument();
  });

  it("browser storage (memory mode): no accounts, so no sign-out", () => {
    const { container } = renderUI(
      <CreatorShell lecturer={lecturer} storage="browser">
        <StorageProbe />
      </CreatorShell>,
    );
    expect(screen.getByTestId("storage")).toHaveTextContent("browser");
    expect(container.querySelector('form[action="/auth/signout"]')).toBeNull();
    expect(screen.getByRole("link", { name: t("creator.nav.analytics") })).toHaveAttribute(
      "href",
      "/quizzes/os-battle/analytics",
    );
  });
});
