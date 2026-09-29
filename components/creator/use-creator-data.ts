"use client";

import { useCallback, useEffect, useState } from "react";
import {
  initialQuizList,
  initialSessionHistory,
  listQuizzes,
  listSessionHistory,
  type QuizListItem,
  type SessionRecord,
} from "./data";
import { useCreatorStorage } from "./storage-context";

/**
 * The quiz library. Browser storage paints the seeds on the server and swaps in
 * local edits right after mount; database storage starts at `null` (loading).
 */
export function useQuizList() {
  const storage = useCreatorStorage();
  const [items, setItems] = useState<QuizListItem[] | null>(() => initialQuizList(storage));
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    try {
      setItems(await listQuizzes(storage));
      setFailed(false);
    } catch {
      setFailed(true);
      setItems((current) => current ?? []);
    }
  }, [storage]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from storage after mount
    void reload();
  }, [reload]);

  return { items, setItems, reload, failed };
}

/** Refreshing on focus is enough for "is my class still running"; never more than this often. */
const FOCUS_REFRESH_MS = 5000;

/**
 * Session history. `now` comes from the server render so the demo history dates
 * match on both sides; the real sessions (game server, this browser) arrive after
 * mount. `records` is `null` while the first load is pending in database mode;
 * `failed` means the last load did not reach the lecturer's sessions.
 */
export function useSessionHistory(now: number) {
  const storage = useCreatorStorage();
  const [records, setRecords] = useState<SessionRecord[] | null>(() => initialSessionHistory(storage, now));
  const [failed, setFailed] = useState(false);
  const [reloads, setReloads] = useState(0);
  const reload = useCallback(() => setReloads((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    let last = 0;
    const refresh = () => {
      last = Date.now();
      return listSessionHistory(storage, Date.now()).then(
        (next) => {
          if (!alive) return;
          setRecords(next);
          setFailed(false);
        },
        () => {
          if (!alive) return;
          setRecords((current) => current ?? []);
          setFailed(true);
        },
      );
    };
    void refresh();
    // A host screen in another tab of this browser writes on every answer; coalesce into one refresh per second.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && !e.key.startsWith("nq:rt:")) return;
      timer ??= setTimeout(() => {
        timer = null;
        void refresh();
      }, 1000);
    };
    // Coming back from the projector tab: the game server may have moved on.
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last > FOCUS_REFRESH_MS) void refresh();
    };
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
      if (timer) clearTimeout(timer);
    };
  }, [storage, reloads]);

  return { records, failed, reload };
}
