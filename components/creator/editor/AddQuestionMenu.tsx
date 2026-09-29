"use client";

import { useEffect, type KeyboardEvent } from "react";
import { Plus } from "lucide-react";
import { NusaButton } from "@/components/ui/NusaButton";
import { NusaBadge } from "@/components/ui/NusaBadge";
import type { QuestionType } from "@/lib/game/types";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";
import { FUTURE_TYPES, PLAYABLE_TYPES, TYPE_HINT_KEYS, TYPE_ICONS, TYPE_LABEL_KEYS } from "./question-types";
import { usePopover } from "./use-popover";

/**
 * "Tambah soal" menu: one entry per playable type with a one-line hint; future types
 * are listed, disabled, so lecturers know they're coming.
 *
 * `placement="pane"` (navigator): opens downward while the navigator is a strip across
 * the top, upward once it is a side pane with the button at its foot.
 */
export function AddQuestionMenu({
  onAdd,
  className,
  placement = "pane",
}: {
  onAdd: (type: QuestionType) => void;
  className?: string;
  placement?: "pane" | "below";
}) {
  const t = useT();
  const { open, close, anchorRef, panelRef, panelId, triggerProps } = usePopover<HTMLDivElement>();

  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")?.focus();
  }, [open, panelRef]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(panelRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)") ?? [])];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const go = (i: number) => items[(i + items.length) % items.length]?.focus();
    if (event.key === "ArrowDown") go(index + 1);
    else if (event.key === "ArrowUp") go(index - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(items.length - 1);
    else if (event.key === "Tab") close(false);
    else return;
    if (event.key !== "Tab") event.preventDefault();
  };

  return (
    <div className={cn("relative", className)}>
      <span ref={anchorRef} className="block">
        <NusaButton
          variant="desk-quiet"
          size="sm"
          block
          icon={<Plus size={16} aria-hidden="true" />}
          aria-haspopup="menu"
          {...triggerProps}
        >
          {t("editor.addQuestion")}
        </NusaButton>
      </span>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="menu"
          aria-label={t("editor.addMenu")}
          onKeyDown={onKeyDown}
          className={cn(
            "nf nf-md nf-desk absolute top-full left-0 z-40 mt-2 w-[min(88vw,320px)] p-2 drop-shadow-[0_18px_30px_rgb(10_22_51/0.16)]",
            // Same threshold as the editor's two-pane layout (container query on the editor).
            placement === "pane" && "@3xl:top-auto @3xl:bottom-full @3xl:mt-0 @3xl:mb-2",
          )}
        >
          {PLAYABLE_TYPES.map((type) => {
            const Icon = TYPE_ICONS[type];
            return (
              <button
                key={type}
                type="button"
                role="menuitem"
                onClick={() => {
                  onAdd(type);
                  close(false);
                }}
                className="flex min-h-12 w-full items-start gap-3 rounded-[8px_2px_12px_2px] px-3 py-2 text-left hover:bg-desk-sunken focus-visible:bg-desk-sunken focus-visible:outline-offset-0"
              >
                <Icon size={18} className="mt-0.5 shrink-0 text-binus-500" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-desk-text">{t(TYPE_LABEL_KEYS[type])}</span>
                  <span className="block text-[12.5px] leading-snug text-desk-muted">{t(TYPE_HINT_KEYS[type])}</span>
                </span>
              </button>
            );
          })}
          <div role="separator" className="mx-3 my-1.5 h-px bg-desk-line" />
          {FUTURE_TYPES.map((type) => {
            const Icon = TYPE_ICONS[type];
            return (
              <button
                key={type}
                type="button"
                role="menuitem"
                disabled
                aria-disabled="true"
                className="flex min-h-11 w-full cursor-not-allowed items-center gap-3 rounded-[8px_2px_12px_2px] px-3 py-1.5 text-left opacity-60"
              >
                <Icon size={18} className="shrink-0 text-desk-faint" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-sm font-semibold text-desk-muted">{t(TYPE_LABEL_KEYS[type])}</span>
                <NusaBadge tone="desk" size="sm">
                  {t("editor.comingSoon")}
                </NusaBadge>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
