"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Quiz } from "@/lib/game/types";
import type { QuizRepository } from "@/lib/quiz/repository";

export type SaveStatus = "saved" | "dirty" | "saving" | "error";

const DEBOUNCE_MS = 900;

/**
 * Debounced autosave keyed on the editor revision (`rev` resets to 0 on load, so a
 * freshly loaded quiz counts as saved). Only one save runs at a time; edits made
 * during a save are picked up by the next one. A failed save keeps the last
 * persisted version untouched and waits for an explicit retry (or Ctrl/Cmd+S).
 */
export function useAutosave(quiz: Quiz | null, rev: number, repository: QuizRepository | null) {
  const [savedRev, setSavedRev] = useState(0);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const latest = useRef({ quiz, rev, savedRev, failed });
  const inFlight = useRef<Promise<boolean> | null>(null);
  useEffect(() => {
    latest.current = { quiz, rev, savedRev, failed };
  }, [quiz, rev, savedRev, failed]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!repository) return false;
    if (inFlight.current) await inFlight.current;
    const { quiz: snapshot, rev: snapshotRev } = latest.current;
    if (!snapshot) return false;
    setSaving(true);
    const run = repository
      .save(snapshot)
      .then(() => {
        setSavedRev((prev) => Math.max(prev, snapshotRev));
        setSavedAt(new Date());
        setFailed(false);
        return true;
      })
      .catch(() => {
        setFailed(true);
        return false;
      })
      .finally(() => {
        inFlight.current = null;
        setSaving(false);
      });
    inFlight.current = run;
    return run;
  }, [repository]);

  const dirty = rev > savedRev;

  useEffect(() => {
    if (!dirty || saving || failed) return;
    const timer = window.setTimeout(() => void save(), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [dirty, saving, failed, rev, save]);

  // Ask before closing the tab with unsaved edits.
  useEffect(() => {
    if (!dirty && !saving) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, saving]);

  /** Save now (Ctrl/Cmd+S, before starting a session). Resolves true once everything is persisted. */
  const flush = useCallback(async () => {
    if (inFlight.current) await inFlight.current;
    const current = latest.current;
    if (current.rev <= current.savedRev && !current.failed) return true;
    return save();
  }, [save]);

  const status: SaveStatus = saving ? "saving" : failed ? "error" : dirty ? "dirty" : "saved";
  return { status, savedAt, flush, retry: save };
}
