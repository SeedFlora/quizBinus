"use client";

import { useEffect, useRef } from "react";
import { Layers, RefreshCw } from "lucide-react";
import { DeskHeader } from "@/components/creator/CreatorShell";
import { NusaButton, NusaLink } from "@/components/ui/NusaButton";
import { NusaSpinner } from "@/components/ui/NusaSpinner";
import { useT } from "@/lib/i18n/client";
import { useSessionHistory } from "../use-creator-data";
import { SessionRow } from "./SessionRow";

/**
 * /sessions: running sessions first (so a lecturer can get back to the projector),
 * then the finished ones, newest first. `focusId` (?focus=) highlights one row.
 */
export function SessionHistory({ now, focusId }: { now: number; focusId: string | null }) {
  const t = useT();
  const { records: loaded, failed, reload } = useSessionHistory(now);
  const records = loaded ?? [];
  const running = records.filter((r) => r.status !== "ended");
  const finished = records.filter((r) => r.status === "ended");
  const hasDemo = records.some((r) => r.demo);
  const focusRef = useRef<HTMLLIElement>(null);
  const focusFound = records.some((r) => r.id === focusId);

  useEffect(() => {
    if (focusFound) focusRef.current?.scrollIntoView({ block: "center" });
  }, [focusFound]);

  return (
    <>
      <DeskHeader
        title={t("sessions.title")}
        subtitle={t("sessions.subtitle")}
        actions={
          <NusaLink href="/quizzes" variant="desk-quiet" icon={<Layers size={18} aria-hidden="true" />}>
            {t("sessions.pickArena")}
          </NusaLink>
        }
      />

      <div className="grid gap-12 px-5 pt-8 pb-20 sm:px-10">
        {running.length > 0 && (
          <section aria-labelledby="sessions-running">
            <h2 id="sessions-running" className="font-display-tight text-2xl text-desk-text">
              {t("sessions.running")}
            </h2>
            <ul className="nf nf-lg nf-desk mt-4">
              {running.map((r) => (
                <SessionRow
                  key={r.id}
                  ref={r.id === focusId ? focusRef : undefined}
                  record={r}
                  focused={r.id === focusId}
                />
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="sessions-finished">
          <h2 id="sessions-finished" className="font-display-tight text-2xl text-desk-text">
            {t("sessions.history")}
          </h2>
          {loaded === null ? (
            <p className="mt-4 flex items-center gap-3 text-sm font-semibold text-desk-muted">
              <NusaSpinner /> {t("common.loading")}
            </p>
          ) : failed && records.length === 0 ? (
            <div role="alert" className="mt-4 flex flex-wrap items-center gap-4">
              <p className="font-bold text-desk-text">{t("sessions.loadFailed")}</p>
              <NusaButton
                variant="desk-quiet"
                size="sm"
                icon={<RefreshCw size={16} aria-hidden="true" />}
                onClick={reload}
              >
                {t("common.retry")}
              </NusaButton>
            </div>
          ) : finished.length === 0 ? (
            <p className="mt-4 text-desk-muted">{t("creator.emptySessions")}</p>
          ) : (
            <ul className="nf nf-lg nf-desk mt-4">
              {finished.map((r) => (
                <SessionRow
                  key={r.id}
                  ref={r.id === focusId ? focusRef : undefined}
                  record={r}
                  focused={r.id === focusId}
                />
              ))}
            </ul>
          )}
          {hasDemo && (
            <p className="mt-5 max-w-[72ch] text-sm leading-relaxed text-desk-muted">{t("sessions.demoNote")}</p>
          )}
        </section>
      </div>
    </>
  );
}
