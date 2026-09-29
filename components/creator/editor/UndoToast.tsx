"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Undo2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { transition } from "@/lib/motion";

export interface ToastMessage {
  id: number;
  message: string;
  /** Question to re-select after undo (e.g. the one that was deleted). */
  restoreId?: string;
}

const DISMISS_MS = 7000;

/** Bottom toast after a destructive edit, with a one-tap undo. */
export function UndoToast({
  toast,
  onUndo,
  onDismiss,
}: {
  toast: ToastMessage | null;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onDismiss, DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            transition={transition.system}
            className="nf nf-md pointer-events-auto flex items-center gap-4 py-2 pr-2 pl-5 text-sm font-semibold text-kapas [--nf-fill:var(--ink)]"
          >
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={onUndo}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-[8px_2px_12px_2px] px-3 font-extrabold text-sun hover:bg-kapas/10 focus-visible:outline-sun"
            >
              <Undo2 size={16} aria-hidden="true" />
              {t("editor.undo")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
