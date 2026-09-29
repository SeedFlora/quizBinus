"use client";

import { useActionState, useState } from "react";
import { CircleAlert, Eye, EyeOff } from "lucide-react";
import { NusaButton } from "@/components/ui/NusaButton";
import { Field, TextInput } from "@/components/ui/desk/Field";
import { useT } from "@/lib/i18n/client";
import type { TranslationKey } from "@/lib/i18n/config";
import { signIn, type SignInErrorCode, type SignInState } from "./actions";

const ERROR_KEYS: Record<SignInErrorCode, TranslationKey> = {
  invalidEmail: "auth.errors.invalidEmail",
  passwordRequired: "auth.errors.passwordRequired",
  invalidCredentials: "auth.errors.invalidCredentials",
  rateLimited: "auth.errors.rateLimited",
  notConfigured: "auth.errors.notConfigured",
  generic: "auth.errors.generic",
};

const INITIAL: SignInState = { status: "idle" };

/**
 * Lecturer sign-in: email + password (accounts are created by an admin).
 * Inputs are controlled so a failed attempt keeps what was typed (React resets
 * uncontrolled fields after a form action); the password is cleared on failure.
 */
export function LoginForm({
  next,
  initialState = INITIAL,
}: {
  next: string;
  /** Starting state, for the design gallery and tests; real use starts idle. */
  initialState?: SignInState;
}) {
  const t = useT();
  const [state, action, pending] = useActionState(signIn, initialState);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  // The error belongs to the attempt that produced it: typing again dismisses it.
  const [dismissed, setDismissed] = useState<SignInState | null>(null);

  const error = state.status === "error" && dismissed !== state ? state.error : null;
  const emailError = error === "invalidEmail" ? t(ERROR_KEYS.invalidEmail) : undefined;
  const passwordError = error === "passwordRequired" ? t(ERROR_KEYS.passwordRequired) : undefined;
  const formError = error && !emailError && !passwordError ? t(ERROR_KEYS[error]) : undefined;

  const submit = (formData: FormData) => {
    setDismissed(null);
    action(formData);
    // Never keep a rejected password around in the field.
    setPassword("");
  };

  return (
    <div>
      <h2 className="font-display-tight text-[1.75rem] leading-tight text-desk-text">{t("auth.panelTitle")}</h2>
      <p className="mt-1.5 text-[15px] text-desk-muted">{t("auth.panelHint")}</p>

      <form action={submit} className="mt-6 grid gap-5" noValidate>
        <input type="hidden" name="next" value={next} />

        <Field label={t("auth.email")} error={emailError}>
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              placeholder={t("auth.emailPlaceholder")}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setDismissed(state);
              }}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>

        <Field label={t("auth.password")} error={passwordError}>
          {({ id, describedBy, invalid }) => (
            <div className="relative">
              <TextInput
                id={id}
                name="password"
                type={reveal ? "text" : "password"}
                autoComplete="current-password"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setDismissed(state);
                }}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                className="pr-12"
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                aria-pressed={reveal}
                aria-label={reveal ? t("auth.hidePassword") : t("auth.showPassword")}
                aria-controls={id}
                className="absolute top-0 right-0 grid size-11 place-items-center rounded-[2px_2px_12px_2px] text-desk-muted transition-colors hover:text-desk-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-binus-500"
              >
                {reveal ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
          )}
        </Field>

        {formError && (
          <p
            role="alert"
            className="flex gap-2.5 rounded-[8px_2px_12px_2px] bg-desk-sunken px-3.5 py-3 text-sm leading-snug font-semibold text-desk-text"
          >
            <CircleAlert size={18} aria-hidden="true" className="mt-px shrink-0 text-danger" />
            {formError}
          </p>
        )}

        <NusaButton type="submit" size="lg" block loading={pending} loadingLabel={t("auth.signingIn")}>
          {t("auth.submit")}
        </NusaButton>
      </form>

      <p className="mt-5 text-[13px] leading-relaxed text-desk-muted">{t("auth.forgotPassword")}</p>
    </div>
  );
}
