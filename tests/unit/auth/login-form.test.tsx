import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderUI, t } from "../../components/render";

const signIn = vi.fn();
vi.mock("@/app/login/actions", () => ({ signIn: (...args: unknown[]) => signIn(...args) }));

const { LoginForm } = await import("@/app/login/LoginForm");

beforeEach(() => {
  signIn.mockReset();
});

describe("LoginForm", () => {
  it("asks for email and password, with no magic-link option", () => {
    renderUI(<LoginForm next="/dashboard" />);
    expect(screen.getByLabelText(t("auth.email"))).toHaveAttribute("type", "email");
    expect(screen.getByLabelText(t("auth.password"))).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: t("auth.submit") })).toHaveAttribute("type", "submit");
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.getByText(t("auth.forgotPassword"))).toBeInTheDocument();
  });

  it("posts email, password and the back-link, then shows the generic error", async () => {
    signIn.mockResolvedValue({ status: "error", error: "invalidCredentials" });
    const user = userEvent.setup();
    renderUI(<LoginForm next="/quizzes/abc/edit" />);
    await user.type(screen.getByLabelText(t("auth.email")), "laras@binus.edu");
    await user.type(screen.getByLabelText(t("auth.password")), "salah-sandi");
    await user.click(screen.getByRole("button", { name: t("auth.submit") }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(t("auth.errors.invalidCredentials")));
    const form = signIn.mock.calls[0]![1] as FormData;
    expect(form.get("email")).toBe("laras@binus.edu");
    expect(form.get("password")).toBe("salah-sandi");
    expect(form.get("next")).toBe("/quizzes/abc/edit");
    // The rejected password is not kept; the email is.
    expect(screen.getByLabelText(t("auth.password"))).toHaveValue("");
    expect(screen.getByLabelText(t("auth.email"))).toHaveValue("laras@binus.edu");
  });

  it("shows field errors next to their field and clears an error on typing", async () => {
    const user = userEvent.setup();
    renderUI(<LoginForm next="/dashboard" initialState={{ status: "error", error: "invalidEmail" }} />);
    const email = screen.getByLabelText(t("auth.email"));
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(t("auth.errors.invalidEmail"))).toBeInTheDocument();
    await user.type(email, "a");
    expect(screen.queryByText(t("auth.errors.invalidEmail"))).toBeNull();
  });

  it("can reveal the password for checking", async () => {
    const user = userEvent.setup();
    renderUI(<LoginForm next="/dashboard" />);
    const toggle = screen.getByRole("button", { name: t("auth.showPassword") });
    await user.click(toggle);
    expect(screen.getByLabelText(t("auth.password"))).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: t("auth.hidePassword") })).toHaveAttribute("aria-pressed", "true");
  });
});
