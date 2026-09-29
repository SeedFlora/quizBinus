"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Segmented } from "@/components/ui/desk/Field";
import { useI18n } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/config";

/**
 * Switches the interface language. The client flips instantly; a refresh
 * re-renders server components (page titles, headings) in the new language.
 */
export function LanguageSetting() {
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const options: Array<{ value: Locale; label: string }> = [
    { value: "id", label: t("settings.languageId") },
    { value: "en", label: t("settings.languageEn") },
  ];

  return (
    <Segmented
      name="locale"
      label={t("settings.language")}
      value={locale}
      options={options}
      onChange={(next) => {
        setLocale(next);
        startTransition(() => router.refresh());
      }}
    />
  );
}
