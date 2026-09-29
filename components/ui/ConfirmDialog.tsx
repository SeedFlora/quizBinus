"use client";

import { useEffect, useId, useRef } from "react";
import { NusaButton } from "./NusaButton";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";

/**
 * Confirmation modal on the native <dialog> element: real modality, focus
 * containment, Esc to cancel and focus restoration come from the platform.
 * Used before destructive host actions (end game, remove player).
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = "energy",
  surface = "stage",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "energy" | "danger";
  surface?: "stage" | "desk";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className={cn(
        "m-auto w-[min(92vw,34rem)] bg-transparent p-0 backdrop:bg-[rgb(2_9_24/0.72)] backdrop:backdrop-blur-[2px]",
        surface === "desk" ? "text-ink" : "text-kapas",
      )}
    >
      <div className={cn("nf nf-lg p-8", surface === "desk" ? "nf-desk" : "nf-panel")}>
        <h2 id={titleId} className="font-display-tight text-2xl leading-tight text-balance">
          {title}
        </h2>
        {body && (
          <p className={cn("mt-3 leading-relaxed", surface === "desk" ? "text-desk-muted" : "text-stage-muted")}>
            {body}
          </p>
        )}
        <div className="mt-8 flex flex-wrap justify-end gap-3">
          <NusaButton variant={surface === "desk" ? "desk-quiet" : "ghost"} size="md" onClick={onCancel} autoFocus>
            {cancelLabel ?? t("common.cancel")}
          </NusaButton>
          <NusaButton variant={tone === "danger" ? "danger" : "energy"} size="md" onClick={onConfirm}>
            {confirmLabel}
          </NusaButton>
        </div>
      </div>
    </dialog>
  );
}
