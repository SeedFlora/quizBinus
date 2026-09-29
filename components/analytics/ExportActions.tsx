"use client";

import { useId, useState } from "react";
import { Download, FileText } from "lucide-react";
import { NusaBadge } from "@/components/ui/NusaBadge";
import { NusaButton } from "@/components/ui/NusaButton";
import { CAMPUS_TIME_ZONE } from "@/components/creator/format";
import type { SessionAnalytics } from "@/lib/analytics/compute";
import { csvLabels, EXPORT_FORMATS, exportFileName } from "@/lib/analytics/export";
import { useI18n } from "@/lib/i18n/client";

/** "2026-09-28 13:26" in campus time: unambiguous, and Excel reads it as a date in any locale. */
const campusStamp = (ms: number) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: CAMPUS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(ms);

/**
 * CSV is the page's one primary action. PDF is registered in the export registry
 * but not built yet, so it is shown, disabled, with the reason in words.
 */
export function ExportActions({ analytics }: { analytics: SessionAnalytics }) {
  const { t, locale } = useI18n();
  const [status, setStatus] = useState("");
  const hintId = useId();
  const pdfId = useId();

  const exportCsv = () => {
    const format = EXPORT_FORMATS.csv;
    if (format.status !== "ready") return;
    const blob = format.build(analytics, {
      labels: csvLabels(t),
      // Excel splits on the OS list separator: ";" with a decimal comma on Indonesian settings.
      dialect: locale === "id" ? "semicolon" : "comma",
      formatDate: campusStamp,
    });
    const started = analytics.session.startedAt;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = exportFileName(analytics, "csv", started === null ? undefined : campusStamp(started).slice(0, 10));
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(t("analytics.exported"));
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <NusaButton
        variant="energy"
        icon={<Download size={18} aria-hidden="true" />}
        onClick={exportCsv}
        aria-describedby={hintId}
      >
        {t("analytics.exportCsv")}
      </NusaButton>
      <span id={hintId} className="sr-only">
        {t("analytics.exportHint")}
      </span>
      <NusaButton
        variant="desk-quiet"
        disabled
        aria-describedby={pdfId}
        className="opacity-70"
        icon={<FileText size={18} aria-hidden="true" />}
        trailing={
          <NusaBadge tone="desk" size="sm">
            {t("analytics.soon")}
          </NusaBadge>
        }
      >
        {t("analytics.exportPdf")}
      </NusaButton>
      <span id={pdfId} className="sr-only">
        {t("analytics.pdfSoon")}
      </span>
      <p role="status" className="sr-only">
        {status}
      </p>
    </div>
  );
}
