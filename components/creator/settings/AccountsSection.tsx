"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, CircleAlert, Copy, KeyRound, UserPlus, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { NusaBadge } from "@/components/ui/NusaBadge";
import { NusaButton } from "@/components/ui/NusaButton";
import { Field, Segmented, TextInput } from "@/components/ui/desk/Field";
import {
  changeOwnPassword,
  createLecturer,
  resetLecturerPassword,
  setLecturerDisabled,
  type AccountActionError,
  type AccountView,
  type ChangePasswordState,
  type CreateAccountState,
} from "@/lib/auth/admin-actions";
import { useI18n, useT } from "@/lib/i18n/client";
import type { TranslationKey } from "@/lib/i18n/config";
import { cn } from "@/lib/cn";
import { formatShortDate, formatTime } from "../format";
import { SALUTATIONS, type Salutation } from "../profile-schema";

/** Mirrors PASSWORD_MIN_LENGTH in lib/auth/password.ts (server-only module). */
const PASSWORD_MIN = 8;

const ACTION_ERRORS: Record<AccountActionError | "invalid" | "emailTaken", TranslationKey> = {
  invalid: "settings.accounts.errors.invalid",
  emailTaken: "settings.accounts.errors.emailTaken",
  forbidden: "settings.accounts.errors.forbidden",
  notFound: "settings.accounts.errors.notFound",
  self: "settings.accounts.errors.self",
  lastAdmin: "settings.accounts.errors.lastAdmin",
  generic: "settings.accounts.errors.generic",
};

type Role = AccountView["role"];

/** A temporary password the admin must hand over; shown once. */
export interface Handover {
  kind: "created" | "reset";
  name: string;
  email: string;
  password: string;
}

type Pending = { kind: "disable" | "reset"; account: AccountView } | null;

function ErrorNote({ children }: { children: string }) {
  return (
    <p
      role="alert"
      className="flex gap-2.5 rounded-[8px_2px_12px_2px] bg-desk-sunken px-3.5 py-3 text-sm leading-snug font-semibold text-desk-text"
    >
      <CircleAlert size={18} aria-hidden="true" className="mt-px shrink-0 text-danger" />
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Admin: accounts list + create                                       */
/* ------------------------------------------------------------------ */

/**
 * Settings → "Akun dosen" (admins, database mode). Lists every account, creates
 * lecturers with a one-time temporary password, disables/enables accounts and
 * resets passwords. Every action is re-authorized on the server.
 */
export function AccountsSection({ accounts, currentUserId }: { accounts: AccountView[]; currentUserId: string }) {
  const { t, locale } = useI18n();
  const [handover, setHandover] = useState<Handover | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [rowError, setRowError] = useState<{ id: string; error: AccountActionError } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const run = (kind: "disable" | "reset", account: AccountView) => {
    setPending(null);
    setRowError(null);
    setBusyId(account.id);
    startTransition(async () => {
      const result =
        kind === "reset"
          ? await resetLecturerPassword(account.id)
          : await setLecturerDisabled(account.id, !account.disabled);
      setBusyId(null);
      if (!result.ok) {
        setRowError({ id: account.id, error: result.error });
        return;
      }
      if (kind === "reset" && result.password) {
        setHandover({ kind: "reset", name: account.fullName, email: account.email, password: result.password });
      }
    });
  };

  const lastLogin = (value: string | null) =>
    value
      ? t("settings.accounts.lastLogin", { date: `${formatShortDate(value, locale)} · ${formatTime(value, locale)}` })
      : t("settings.accounts.neverLoggedIn");

  return (
    <div className="grid gap-8">
      {handover && <PasswordHandover handover={handover} onDismiss={() => setHandover(null)} />}

      <div>
        <p className="text-[13px] font-bold text-desk-muted">
          {t("settings.accounts.count", { count: accounts.length })}
        </p>
        <ul aria-label={t("settings.accounts.listLabel")} className="mt-2 border-t border-desk-line">
          {accounts.map((account) => {
            const self = account.id === currentUserId;
            const busy = busyId === account.id;
            return (
              <li
                key={account.id}
                className={cn(
                  "grid gap-x-4 gap-y-3 border-b border-desk-line py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center",
                  account.disabled && "opacity-70",
                )}
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-desk-text">
                      {account.salutation ? `${account.salutation} ` : ""}
                      {account.fullName}
                    </span>
                    {self && (
                      <NusaBadge tone="desk-primary" size="sm">
                        {t("settings.accounts.you")}
                      </NusaBadge>
                    )}
                    {account.role === "admin" && (
                      <NusaBadge tone="desk" size="sm">
                        {t("settings.accounts.roleAdmin")}
                      </NusaBadge>
                    )}
                    {account.disabled && (
                      <NusaBadge tone="desk" size="sm">
                        {t("settings.accounts.disabledBadge")}
                      </NusaBadge>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-desk-muted">{account.email}</p>
                  <p className="mt-0.5 text-[13px] text-desk-faint">{lastLogin(account.lastLoginAt)}</p>
                  {rowError?.id === account.id && (
                    <p role="alert" className="mt-2 text-[13px] font-semibold text-danger">
                      {t(ACTION_ERRORS[rowError.error])}
                    </p>
                  )}
                </div>
                {!self && (
                  <div
                    role="group"
                    aria-label={t("settings.accounts.rowActions", { name: account.fullName })}
                    className="flex flex-wrap gap-2"
                  >
                    <NusaButton
                      variant="desk-quiet"
                      size="sm"
                      disabled={busy}
                      icon={<KeyRound size={15} aria-hidden="true" />}
                      onClick={() => setPending({ kind: "reset", account })}
                    >
                      {t("settings.accounts.resetPassword")}
                    </NusaButton>
                    <NusaButton
                      variant="desk-quiet"
                      size="sm"
                      loading={busy}
                      // Re-enabling is harmless and immediate: no confirmation.
                      onClick={() =>
                        account.disabled ? run("disable", account) : setPending({ kind: "disable", account })
                      }
                    >
                      {account.disabled ? t("settings.accounts.enable") : t("settings.accounts.disable")}
                    </NusaButton>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <CreateAccountForm onCreated={setHandover} />

      <ConfirmDialog
        open={pending !== null}
        surface="desk"
        tone={pending?.kind === "disable" ? "danger" : "energy"}
        title={
          pending?.kind === "reset"
            ? t("settings.accounts.resetTitle", { name: pending.account.fullName })
            : t("settings.accounts.disableTitle", { name: pending?.account.fullName ?? "" })
        }
        body={
          pending?.kind === "reset"
            ? t("settings.accounts.resetBody", { name: pending.account.fullName })
            : t("settings.accounts.disableBody", { name: pending?.account.fullName ?? "" })
        }
        confirmLabel={pending?.kind === "reset" ? t("settings.accounts.resetPassword") : t("settings.accounts.disable")}
        onConfirm={() => pending && run(pending.kind, pending.account)}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}

/** The one-time temporary password after creating an account or resetting one. */
export function PasswordHandover({ handover, onDismiss }: { handover: Handover; onDismiss: () => void }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(handover.password);
      setCopied(true);
    } catch {
      /* clipboard blocked (http on a LAN IP): the password stays selectable */
    }
  };
  return (
    <div role="status" className="nf nf-md nf-desk">
      <div className="relative px-5 pt-5 pb-6 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <p className="font-bold text-desk-text">
            {handover.kind === "created"
              ? t("settings.accounts.tempCreated", { name: handover.name })
              : t("settings.accounts.tempReset", { name: handover.name })}
          </p>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t("settings.accounts.dismiss")}
            className="-mt-2 -mr-2 grid size-10 shrink-0 place-items-center rounded-[8px_2px_12px_2px] text-desk-muted transition-colors hover:bg-desk-sunken hover:text-desk-text"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <p className="mt-1 max-w-[56ch] text-sm leading-relaxed text-desk-muted">
          {t("settings.accounts.tempBody", { email: handover.email })}
        </p>
        <p className="mt-4 text-[13px] font-bold text-desk-muted">{t("settings.accounts.tempLabel")}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <code className="rounded-[8px_2px_12px_2px] bg-desk-sunken px-4 py-2.5 font-mono text-xl tracking-wider break-all text-desk-text select-all">
            {handover.password}
          </code>
          <NusaButton
            variant="desk-quiet"
            size="sm"
            onClick={copy}
            icon={copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
          >
            {copied ? t("settings.accounts.copied") : t("settings.accounts.copy")}
          </NusaButton>
        </div>
      </div>
    </div>
  );
}

const CREATE_INITIAL: CreateAccountState = { status: "idle" };

function CreateAccountForm({ onCreated }: { onCreated: (handover: Handover) => void }) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [salutation, setSalutation] = useState<Salutation>("Bu");
  const [role, setRole] = useState<Role>("lecturer");

  const [state, action, pending] = useActionState(async (prev: CreateAccountState, formData: FormData) => {
    const next = await createLecturer(prev, formData);
    if (next.status === "created") {
      onCreated({ kind: "created", name: next.fullName, email: next.email, password: next.password });
      setEmail("");
      setFullName("");
      setRole("lecturer");
    }
    return next;
  }, CREATE_INITIAL);

  const error = state.status === "error" ? state.error : null;

  return (
    <form action={action} className="grid gap-5 border-t border-desk-line pt-6" noValidate>
      <div>
        <h3 className="flex items-center gap-2 text-[17px] font-bold text-desk-text">
          <UserPlus size={18} aria-hidden="true" className="text-binus-500" />
          {t("settings.accounts.createTitle")}
        </h3>
        <p className="mt-1 text-sm text-desk-muted">{t("settings.accounts.createHint")}</p>
      </div>

      <div className="grid items-start gap-5 sm:grid-cols-2">
        <Field
          label={t("settings.accounts.email")}
          error={error === "emailTaken" ? t(ACTION_ERRORS.emailTaken) : undefined}
        >
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={254}
              placeholder={t("settings.accounts.emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>
        <Field label={t("settings.accounts.fullName")}>
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              name="fullName"
              autoComplete="off"
              required
              maxLength={60}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              aria-describedby={describedBy}
            />
          )}
        </Field>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-5">
        <div className="grid gap-1.5">
          <span className="text-sm font-bold text-desk-text" aria-hidden="true">
            {t("settings.accounts.salutation")}
          </span>
          <Segmented
            name="salutation"
            label={t("settings.accounts.salutation")}
            value={salutation}
            options={SALUTATIONS.map((s) => ({ value: s, label: s }))}
            onChange={setSalutation}
            className="justify-self-start"
          />
        </div>
        <div className="grid gap-1.5">
          <span className="text-sm font-bold text-desk-text" aria-hidden="true">
            {t("settings.accounts.role")}
          </span>
          <Segmented<Role>
            name="role"
            label={t("settings.accounts.role")}
            value={role}
            options={[
              { value: "lecturer", label: t("settings.accounts.roleLecturer") },
              { value: "admin", label: t("settings.accounts.roleAdmin") },
            ]}
            onChange={setRole}
            className="justify-self-start"
          />
        </div>
      </div>

      {error && error !== "emailTaken" && <ErrorNote>{t(ACTION_ERRORS[error])}</ErrorNote>}

      <div>
        <NusaButton type="submit" variant="desk" loading={pending} loadingLabel={t("settings.accounts.creating")}>
          {t("settings.accounts.create")}
        </NusaButton>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Any database lecturer: change own password                          */
/* ------------------------------------------------------------------ */

const PASSWORD_ERRORS: Record<Exclude<ChangePasswordState, { status: "idle" | "saved" }>["error"], TranslationKey> = {
  invalid: "settings.accounts.passwordErrors.invalid",
  tooShort: "settings.accounts.passwordErrors.tooShort",
  mismatch: "settings.accounts.passwordErrors.mismatch",
  wrongPassword: "settings.accounts.passwordErrors.wrongPassword",
  rateLimited: "settings.accounts.passwordErrors.rateLimited",
  forbidden: "settings.accounts.passwordErrors.forbidden",
  generic: "settings.accounts.passwordErrors.generic",
};

const PASSWORD_INITIAL: ChangePasswordState = { status: "idle" };

/** Settings → "Kata sandi": replace the admin's temporary password with your own. */
export function ChangePasswordForm() {
  const t = useT();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const [state, action, pending] = useActionState(async (prev: ChangePasswordState, formData: FormData) => {
    const result = await changeOwnPassword(prev, formData);
    if (result.status === "saved") {
      setCurrent("");
      setNext("");
      setConfirm("");
    }
    return result;
  }, PASSWORD_INITIAL);

  const error = state.status === "error" ? state.error : null;
  const message = error ? t(PASSWORD_ERRORS[error], { min: PASSWORD_MIN }) : undefined;
  const fieldFor = (field: "current" | "next" | "confirm") =>
    (field === "current" && error === "wrongPassword") ||
    (field === "next" && error === "tooShort") ||
    (field === "confirm" && error === "mismatch")
      ? message
      : undefined;
  const formMessage =
    message && !fieldFor("current") && !fieldFor("next") && !fieldFor("confirm") ? message : undefined;

  return (
    <form action={action} className="grid gap-5" noValidate>
      <Field label={t("settings.accounts.currentPassword")} error={fieldFor("current")}>
        {({ id, describedBy, invalid }) => (
          <TextInput
            id={id}
            name="current"
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>
      <div className="grid items-start gap-5 sm:grid-cols-2">
        <Field
          label={t("settings.accounts.newPassword")}
          hint={t("settings.accounts.newPasswordHint", { min: PASSWORD_MIN })}
          error={fieldFor("next")}
        >
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              name="next"
              type="password"
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>
        <Field label={t("settings.accounts.confirmPassword")} error={fieldFor("confirm")}>
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>
      </div>

      {formMessage && <ErrorNote>{formMessage}</ErrorNote>}

      <div className="flex flex-wrap items-center gap-4">
        <NusaButton type="submit" variant="desk" loading={pending} loadingLabel={t("settings.accounts.savingPassword")}>
          {t("settings.accounts.savePassword")}
        </NusaButton>
        <p role="status" className="flex items-center gap-1.5 text-sm font-semibold text-desk-muted">
          {state.status === "saved" && !pending && (
            <>
              <Check size={16} aria-hidden="true" className="text-success" />
              {t("settings.accounts.passwordSaved")}
            </>
          )}
        </p>
      </div>
    </form>
  );
}
