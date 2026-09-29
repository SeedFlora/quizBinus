"use client";

import { useActionState, useState } from "react";
import { Check, Lock } from "lucide-react";
import { Field, Segmented, TextInput } from "@/components/ui/desk/Field";
import { NusaButton } from "@/components/ui/NusaButton";
import { useT } from "@/lib/i18n/client";
import { saveProfile, type SaveProfileState } from "../profile-actions";
import { profileSchema, SALUTATIONS, type Salutation } from "../profile-schema";

const INITIAL: SaveProfileState = { status: "idle" };

/** Name + salutation (editable), email (read-only: it is the sign-in, managed by an admin). */
export function ProfileForm({
  fullName,
  salutation,
  email,
  demo,
}: {
  fullName: string;
  salutation: Salutation;
  email?: string;
  demo: boolean;
}) {
  const t = useT();
  const [state, action, pending] = useActionState(saveProfile, INITIAL);
  // Controlled so a submitted-but-invalid value isn't wiped by React's post-action form reset.
  const [name, setName] = useState(fullName);
  const [title, setTitle] = useState<Salutation>(salutation);
  const [clientInvalid, setClientInvalid] = useState(false);
  const nameError = clientInvalid || (state.status === "invalid" && !pending);

  // Same schema as the server: catch the obvious mistake without a round trip.
  const submit = (formData: FormData) => {
    const ok = profileSchema.shape.fullName.safeParse(formData.get("fullName")).success;
    setClientInvalid(!ok);
    if (ok) action(formData);
  };

  return (
    <form action={submit} className="grid gap-5" noValidate>
      <Field label={t("settings.fullName")} error={nameError ? t("settings.nameError") : undefined}>
        {({ id, describedBy, invalid }) => (
          <TextInput
            id={id}
            name="fullName"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setClientInvalid(false);
            }}
            autoComplete="name"
            maxLength={60}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>

      <div className="grid gap-1.5">
        <span className="text-sm font-bold text-desk-text" aria-hidden="true">
          {t("settings.salutation")}
        </span>
        <Segmented
          name="salutation"
          label={t("settings.salutation")}
          value={title}
          options={SALUTATIONS.map((s) => ({ value: s, label: s }))}
          onChange={setTitle}
          className="justify-self-start"
        />
      </div>

      {email && (
        <Field label={t("settings.email")} hint={t("settings.emailHint")}>
          {({ id, describedBy }) => (
            <div className="relative">
              <TextInput
                id={id}
                value={email}
                readOnly
                aria-describedby={describedBy}
                className="bg-desk-sunken! pr-10 text-desk-muted!"
              />
              <Lock
                size={16}
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-desk-faint"
              />
            </div>
          )}
        </Field>
      )}

      <div className="flex flex-wrap items-center gap-4 pt-1">
        <NusaButton type="submit" variant="energy" loading={pending} loadingLabel={t("common.saving")}>
          {t("settings.saveProfile")}
        </NusaButton>
        <p role="status" className="flex items-center gap-1.5 text-sm font-semibold text-desk-muted">
          {state.status === "saved" && !pending && !clientInvalid && (
            <>
              <Check size={16} aria-hidden="true" className="text-success" />
              {t("settings.profileSaved")}
            </>
          )}
          {state.status === "failed" && !pending && <span className="text-danger">{t("settings.profileFailed")}</span>}
        </p>
      </div>
      {demo && <p className="-mt-1 text-[13px] text-desk-faint">{t("settings.demoProfileNote")}</p>}
    </form>
  );
}
