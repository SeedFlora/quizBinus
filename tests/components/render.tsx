import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n/client";
import { createTranslator } from "@/lib/i18n/config";

/** Indonesian copy, read from the same dictionary the components use. */
export const t = createTranslator("id");

function Providers({ children }: { children: ReactNode }) {
  return <I18nProvider initialLocale="id">{children}</I18nProvider>;
}

/** render() inside the i18n provider every client component expects. */
export function renderUI(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return render(ui, { wrapper: Providers, ...options });
}

/**
 * Accessible name of an answer button: "B. Round Robin" in browsers. jsdom's name
 * computation drops the space after the visually-hidden "B.", so match either.
 */
export function answerName(letter: string, text: string) {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${letter}\\.\\s?${escaped}`);
}
