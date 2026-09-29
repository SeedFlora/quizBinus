"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { RefreshCw, Wifi } from "lucide-react";
import type { ConnectionStatus } from "@/lib/realtime/types";
import { useT } from "@/lib/i18n/client";

/**
 * "Tersambung ulang…" while the link is down; a brief "Kembali ke permainan."
 * when it returns. Never blocks input on its own; the game state decides that.
 */
export function ConnectionBanner({ status }: { status: ConnectionStatus }) {
  const t = useT();
  const [restored, setRestored] = useState(false);
  const wasDown = useRef(false);

  useEffect(() => {
    if (status === "reconnecting" || status === "offline") {
      wasDown.current = true;
      return;
    }
    if (status === "online" && wasDown.current) {
      wasDown.current = false;

      setRestored(true);
      const id = window.setTimeout(() => setRestored(false), 2200);
      return () => window.clearTimeout(id);
    }
  }, [status]);

  const down = status === "reconnecting" || status === "offline";
  const text =
    status === "offline" ? t("connection.offline") : down ? t("connection.reconnecting") : t("connection.restored");

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-[max(10px,env(safe-area-inset-top))]"
      aria-live="polite"
    >
      {/* "wait": the exiting "down" pill would otherwise share the centred row with the
          entering "restored" one and push it aside, squeezed onto two lines. */}
      <AnimatePresence mode="wait">
        {(down || restored) && (
          <motion.div
            key={down ? "down" : "up"}
            className={`nf nf-md flex items-center gap-2 py-2.5 pr-5 pl-4 text-sm font-extrabold ${down ? "nf-kapas" : "nf-sun"}`}
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            role="status"
          >
            {down ? (
              <RefreshCw size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <Wifi size={16} aria-hidden="true" />
            )}
            {text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
