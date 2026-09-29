"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

/**
 * Minimal disclosure popover: toggled by a trigger, closed by Escape or a pointer
 * press outside; focus returns to the trigger when closed from the keyboard.
 * `anchorRef` may wrap the trigger (e.g. a <span> around a NusaButton).
 */
export function usePopover<T extends HTMLElement = HTMLDivElement>() {
  const [open, setOpen] = useState(false);
  const id = useId();
  const anchorRef = useRef<HTMLElement>(null);
  const panelRef = useRef<T>(null);

  const focusTrigger = useCallback(() => {
    const anchor = anchorRef.current;
    const button = anchor instanceof HTMLButtonElement ? anchor : anchor?.querySelector("button");
    button?.focus();
  }, []);

  const close = useCallback(
    (returnFocus = true) => {
      setOpen(false);
      if (returnFocus) focusTrigger();
    },
    [focusTrigger],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, close]);

  return {
    open,
    setOpen,
    close,
    anchorRef,
    panelRef,
    panelId: id,
    triggerProps: {
      "aria-expanded": open,
      "aria-controls": open ? id : undefined,
      onClick: () => setOpen((v) => !v),
    },
  };
}
