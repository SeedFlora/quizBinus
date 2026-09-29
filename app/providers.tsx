"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { I18nProvider } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/config";
import { useAudioUnlock } from "@/lib/audio/use-sound";

function AudioUnlock() {
  useAudioUnlock();
  return null;
}

export function Providers({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <I18nProvider initialLocale={locale}>
      {/* "user" = follow prefers-reduced-motion for every motion component */}
      <MotionConfig reducedMotion="user">
        <AudioUnlock />
        {children}
      </MotionConfig>
    </I18nProvider>
  );
}
