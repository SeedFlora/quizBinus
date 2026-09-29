"use client";

import "./globals.css";
import { useEffect, useSyncExternalStore } from "react";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import { RotateCcw } from "lucide-react";
import { NusaButton } from "@/components/ui/NusaButton";
import { KawungGap, StageFallback } from "@/components/ui/StageFallback";
import { createTranslator, DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "@/lib/i18n/config";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  axes: ["wdth", "opsz"],
  display: "swap",
});
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

const noSubscribe = () => () => undefined;

function cookieLocale(): Locale {
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
  const value = match?.[1];
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * Last-resort boundary: replaces the root layout, so it brings its own document,
 * styles and fonts, and translates without the I18nProvider (locale from cookie).
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const locale = useSyncExternalStore(noSubscribe, cookieLocale, () => DEFAULT_LOCALE);
  const t = createTranslator(locale);

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang={locale} className={`${bricolage.variable} ${jakarta.variable}`}>
      <body className="min-h-dvh">
        <title>{t("errors.generic")}</title>
        <StageFallback
          glyph={<KawungGap variant="loose" />}
          title={t("errors.generic")}
          body={t("design.fallback.errorBody")}
          actions={
            <NusaButton size="lg" onClick={() => retry()} icon={<RotateCcw size={18} aria-hidden="true" />}>
              {t("common.retry")}
            </NusaButton>
          }
          footnote={
            error.digest ? (
              <p className="mt-10 text-sm text-stage-faint">
                {t("design.fallback.reference")}: <code className="font-mono text-stage-muted">{error.digest}</code>
              </p>
            ) : null
          }
        />
      </body>
    </html>
  );
}
