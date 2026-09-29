"use client";

/* eslint-disable @next/next/no-img-element -- lecturer-supplied media (data: URL or /api/media file) of unknown size */
import { useId, useRef, useState, type DragEvent } from "react";
import { ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import { NusaButton } from "@/components/ui/NusaButton";
import { NusaSpinner } from "@/components/ui/NusaSpinner";
import { useCreatorStorage } from "@/components/creator/storage-context";
import { getMediaUploader, MediaError, MEDIA_LIMITS, type MediaErrorCode } from "@/lib/media";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";
import { InlineIssue } from "./ui";

/**
 * Question image: pick or drop a file, it is resized in the browser (≤1280px) and
 * stored by the active MediaUploader. The preview sits on the stage navy so the
 * lecturer sees the image the way the projector will show it.
 */
export function MediaField({
  quizId,
  url,
  onChange,
}: {
  quizId: string;
  url: string | undefined;
  onChange: (url: string | undefined, options?: { structural?: boolean }) => void;
}) {
  const t = useT();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MediaErrorCode | null>(null);
  const [dragging, setDragging] = useState(false);
  const uploader = getMediaUploader(useCreatorStorage());

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const previous = url;
      const media = await uploader.upload(file, { quizId });
      onChange(media.url, { structural: Boolean(previous) });
      if (previous) void uploader.remove(previous).catch(() => undefined);
    } catch (e) {
      setError(e instanceof MediaError ? e.code : "upload_failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void upload(event.dataTransfer.files[0]);
  };

  const fileInput = (
    <input
      ref={inputRef}
      id={inputId}
      type="file"
      accept={MEDIA_LIMITS.accept}
      className="sr-only"
      tabIndex={-1}
      onChange={(e) => void upload(e.target.files?.[0])}
    />
  );

  if (url) {
    return (
      <div>
        {fileInput}
        <figure className="nf nf-md overflow-hidden [--nf-fill:var(--binus-blue-950)]">
          <img src={url} alt="" className="nf-clip max-h-64 w-full object-contain" />
        </figure>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <NusaButton
            variant="desk-quiet"
            size="sm"
            loading={busy}
            loadingLabel={t("editor.mediaUploading")}
            icon={<RefreshCw size={15} aria-hidden="true" />}
            onClick={() => inputRef.current?.click()}
          >
            {t("editor.replaceMedia")}
          </NusaButton>
          <NusaButton
            variant="desk-quiet"
            size="sm"
            icon={<Trash2 size={15} aria-hidden="true" />}
            onClick={() => {
              onChange(undefined, { structural: true });
              void uploader.remove(url).catch(() => undefined);
            }}
          >
            {t("editor.removeMedia")}
          </NusaButton>
        </div>
        {error && <InlineIssue>{t(`editor.mediaErrors.${error}`)}</InlineIssue>}
      </div>
    );
  }

  return (
    <div>
      {fileInput}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        disabled={busy}
        aria-describedby={`${inputId}-hint`}
        className={cn(
          "group flex min-h-20 w-full items-center gap-4 rounded-[10px_3px_18px_3px] border-2 border-dashed px-4 py-3 text-left transition-colors",
          dragging
            ? "border-binus-500 bg-binus-500/5"
            : "border-desk-line hover:border-desk-faint hover:bg-desk-surface",
        )}
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-[8px_2px_12px_2px] bg-desk-sunken text-binus-500">
          {busy ? <NusaSpinner /> : <ImagePlus size={20} aria-hidden="true" />}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold text-desk-text">
            {busy ? t("editor.mediaUploading") : t("editor.addMedia")}
          </span>
          <span id={`${inputId}-hint`} className="block text-[13px] text-desk-muted">
            {t("editor.mediaDrop")} · {t("editor.mediaHint")}
          </span>
        </span>
      </button>
      {uploader.kind === "local" && !error && (
        <p className="mt-2 text-[13px] text-desk-faint">{t("editor.mediaLocal")}</p>
      )}
      {error && <InlineIssue>{t(`editor.mediaErrors.${error}`)}</InlineIssue>}
    </div>
  );
}
