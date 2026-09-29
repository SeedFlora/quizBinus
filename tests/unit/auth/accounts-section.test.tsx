import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountView } from "@/lib/auth/admin-actions";
import { renderUI, t } from "../../components/render";

const actions = {
  createLecturer: vi.fn(),
  setLecturerDisabled: vi.fn(),
  resetLecturerPassword: vi.fn(),
  changeOwnPassword: vi.fn(),
};
vi.mock("@/lib/auth/admin-actions", () => ({
  createLecturer: (...a: unknown[]) => actions.createLecturer(...a),
  setLecturerDisabled: (...a: unknown[]) => actions.setLecturerDisabled(...a),
  resetLecturerPassword: (...a: unknown[]) => actions.resetLecturerPassword(...a),
  changeOwnPassword: (...a: unknown[]) => actions.changeOwnPassword(...a),
}));

const { AccountsSection, ChangePasswordForm } = await import("@/components/creator/settings/AccountsSection");

const ADMIN: AccountView = {
  id: "00000000-0000-4000-8000-0000000000a1",
  email: "admin@binus.edu",
  fullName: "Admin Kampus",
  salutation: "",
  role: "admin",
  disabled: false,
  createdAt: "2026-09-01T01:00:00.000Z",
  lastLoginAt: "2026-09-28T02:10:00.000Z",
};
const LARAS: AccountView = {
  ...ADMIN,
  id: "00000000-0000-4000-8000-0000000000b2",
  email: "laras@binus.edu",
  fullName: "Laras Wicaksono",
  salutation: "Bu",
  role: "lecturer",
  lastLoginAt: null,
};
const BUDI: AccountView = {
  ...LARAS,
  id: "00000000-0000-4000-8000-0000000000c3",
  email: "budi@binus.edu",
  fullName: "Budi",
  disabled: true,
};

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
});

/** The list row of an account, found by its (unique) email. */
function rowOf(account: AccountView) {
  return screen.getByText(account.email).closest("li")!;
}

describe("AccountsSection", () => {
  it("lists every account; your own row has no actions", () => {
    renderUI(<AccountsSection accounts={[ADMIN, LARAS, BUDI]} currentUserId={ADMIN.id} />);
    const list = screen.getByRole("list", { name: t("settings.accounts.listLabel") });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    const self = rowOf(ADMIN);
    expect(within(self).getByText(t("settings.accounts.you"))).toBeInTheDocument();
    expect(within(self).queryByRole("button")).toBeNull();
    expect(within(rowOf(LARAS)).getByText(t("settings.accounts.neverLoggedIn"))).toBeInTheDocument();
    expect(within(rowOf(BUDI)).getByText(t("settings.accounts.disabledBadge"))).toBeInTheDocument();
  });

  it("confirms before disabling, and re-enables without a dialog", async () => {
    actions.setLecturerDisabled.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderUI(<AccountsSection accounts={[ADMIN, LARAS, BUDI]} currentUserId={ADMIN.id} />);

    await user.click(within(rowOf(LARAS)).getByRole("button", { name: t("settings.accounts.disable") }));
    const dialog = screen.getByRole("dialog", {
      name: t("settings.accounts.disableTitle", { name: "Laras Wicaksono" }),
    });
    expect(actions.setLecturerDisabled).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: t("settings.accounts.disable") }));
    await waitFor(() => expect(actions.setLecturerDisabled).toHaveBeenCalledWith(LARAS.id, true));

    await user.click(within(rowOf(BUDI)).getByRole("button", { name: t("settings.accounts.enable") }));
    await waitFor(() => expect(actions.setLecturerDisabled).toHaveBeenCalledWith(BUDI.id, false));
  });

  it("shows the server's refusal on the row", async () => {
    actions.setLecturerDisabled.mockResolvedValue({ ok: false, error: "lastAdmin" });
    const user = userEvent.setup();
    renderUI(<AccountsSection accounts={[ADMIN, LARAS]} currentUserId={ADMIN.id} />);
    await user.click(within(rowOf(LARAS)).getByRole("button", { name: t("settings.accounts.disable") }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: t("settings.accounts.disable") }));
    expect(await within(rowOf(LARAS)).findByRole("alert")).toHaveTextContent(t("settings.accounts.errors.lastAdmin"));
  });

  it("hands over the temporary password after a reset, once", async () => {
    actions.resetLecturerPassword.mockResolvedValue({ ok: true, password: "Kx7m-Q2pa-Hn9d" });
    const user = userEvent.setup();
    renderUI(<AccountsSection accounts={[ADMIN, LARAS]} currentUserId={ADMIN.id} />);
    await user.click(within(rowOf(LARAS)).getByRole("button", { name: t("settings.accounts.resetPassword") }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: t("settings.accounts.resetPassword") }),
    );
    expect(await screen.findByText("Kx7m-Q2pa-Hn9d")).toBeInTheDocument();
    expect(actions.resetLecturerPassword).toHaveBeenCalledWith(LARAS.id);
    expect(screen.getByText(t("settings.accounts.tempReset", { name: "Laras Wicaksono" }))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t("settings.accounts.dismiss") }));
    expect(screen.queryByText("Kx7m-Q2pa-Hn9d")).toBeNull();
  });

  it("creates a lecturer and shows the temporary password", async () => {
    actions.createLecturer.mockResolvedValue({
      status: "created",
      email: "dewi@binus.edu",
      fullName: "Dewi Lestari",
      password: "abcd-EFGH-2345",
      at: 1,
    });
    const user = userEvent.setup();
    renderUI(<AccountsSection accounts={[ADMIN]} currentUserId={ADMIN.id} />);
    await user.type(screen.getByLabelText(t("settings.accounts.email")), "dewi@binus.edu");
    await user.type(screen.getByLabelText(t("settings.accounts.fullName")), "Dewi Lestari");
    await user.click(screen.getByRole("button", { name: t("settings.accounts.create") }));

    expect(await screen.findByText("abcd-EFGH-2345")).toBeInTheDocument();
    const form = actions.createLecturer.mock.calls[0]![1] as FormData;
    expect(Object.fromEntries(form)).toMatchObject({
      email: "dewi@binus.edu",
      fullName: "Dewi Lestari",
      salutation: "Bu",
      role: "lecturer",
    });
    expect(screen.getByLabelText(t("settings.accounts.email"))).toHaveValue("");
  });

  it("explains a taken email next to the field", async () => {
    actions.createLecturer.mockResolvedValue({ status: "error", error: "emailTaken", at: 1 });
    const user = userEvent.setup();
    renderUI(<AccountsSection accounts={[ADMIN]} currentUserId={ADMIN.id} />);
    await user.type(screen.getByLabelText(t("settings.accounts.email")), "laras@binus.edu");
    await user.type(screen.getByLabelText(t("settings.accounts.fullName")), "Laras");
    await user.click(screen.getByRole("button", { name: t("settings.accounts.create") }));
    expect(await screen.findByText(t("settings.accounts.errors.emailTaken"))).toBeInTheDocument();
  });
});

describe("ChangePasswordForm", () => {
  it("points the mismatch error at the confirmation field", async () => {
    actions.changeOwnPassword.mockResolvedValue({ status: "error", error: "mismatch", at: 1 });
    const user = userEvent.setup();
    renderUI(<ChangePasswordForm />);
    await user.type(screen.getByLabelText(t("settings.accounts.currentPassword")), "lama-sandi");
    await user.type(screen.getByLabelText(t("settings.accounts.newPassword")), "baru-sandi-1");
    await user.type(screen.getByLabelText(t("settings.accounts.confirmPassword")), "baru-sandi-2");
    await user.click(screen.getByRole("button", { name: t("settings.accounts.savePassword") }));
    expect(await screen.findByText(t("settings.accounts.passwordErrors.mismatch"))).toBeInTheDocument();
    expect(screen.getByLabelText(t("settings.accounts.confirmPassword"))).toHaveAttribute("aria-invalid", "true");
  });

  it("clears the fields after a successful change", async () => {
    actions.changeOwnPassword.mockResolvedValue({ status: "saved", at: 1 });
    const user = userEvent.setup();
    renderUI(<ChangePasswordForm />);
    await user.type(screen.getByLabelText(t("settings.accounts.currentPassword")), "lama-sandi");
    await user.type(screen.getByLabelText(t("settings.accounts.newPassword")), "baru-sandi-1");
    await user.type(screen.getByLabelText(t("settings.accounts.confirmPassword")), "baru-sandi-1");
    await user.click(screen.getByRole("button", { name: t("settings.accounts.savePassword") }));
    expect(await screen.findByText(t("settings.accounts.passwordSaved"))).toBeInTheDocument();
    expect(screen.getByLabelText(t("settings.accounts.newPassword"))).toHaveValue("");
  });
});
