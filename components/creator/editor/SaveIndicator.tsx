"use client";

import { CloudAlert, CloudCheck, PencilLine } from "lucide-react";
import { NusaSpinner } from "@/components/ui/NusaSpinner";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";
import type { SaveStatus } from "./use-autosave";

/** Always-visible autosave state. Icon + words, never colour alone. */
export function SaveIndicator({
  status,
  savedAt,
  onRetry,
}: {
  status: SaveStatus;
  savedAt: Date | null;
  onRetry: () => void;
}) {
  const { t, locale } = useI18n();
  const time = savedAt
    ? new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", { hour: "2-digit", minute: "2-digit" }).format(
        savedAt,
      )
    : null;

  return (
    <div className="flex items-center gap-2 text-[13px] font-semibold" role="status" aria-live="polite">
      {status === "saving" && (
        <>
          <NusaSpinner size={15} className="text-binus-500" />
          <span className="text-desk-muted">{t("editor.save.saving")}</span>
        </>
      )}
      {status === "saved" && (
        <>
          <CloudCheck size={17} className="text-success" aria-hidden="true" />
          <span className="text-desk-muted">{time ? t("editor.save.savedAt", { time }) : t("editor.save.saved")}</span>
        </>
      )}
      {status === "dirty" && (
        <>
          <PencilLine size={15} className="text-desk-faint" aria-hidden="true" />
          <span className="text-desk-muted">{t("editor.save.dirty")}</span>
        </>
      )}
      {status === "error" && (
        <>
          <CloudAlert size={17} className="text-danger" aria-hidden="true" />
          <span className="text-danger">{t("editor.save.error")}</span>
          <button
            type="button"
            onClick={onRetry}
            className={cn("min-h-11 px-1 font-bold text-binus-500 underline decoration-2 underline-offset-4")}
          >
            {t("editor.save.retry")}
          </button>
        </>
      )}
    </div>
  );
}
