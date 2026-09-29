"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleAlert, Plus, RefreshCw, Sparkles } from "lucide-react";
import { DeskHeader } from "@/components/creator/CreatorShell";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { NusaButton, NusaLink } from "@/components/ui/NusaButton";
import { NusaSpinner } from "@/components/ui/NusaSpinner";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";
import { coursesOf, deleteQuiz, duplicateQuiz, filterQuizzes, type LibraryFilter, type QuizListItem } from "../data";
import { useStartSession } from "../start-session";
import { useCreatorStorage } from "../storage-context";
import { useQuizList } from "../use-creator-data";
import { LibraryEmpty } from "./LibraryEmpty";
import { LibraryToolbar } from "./LibraryToolbar";
import { LIBRARY_COLUMNS, QuizRow } from "./QuizRow";

const NO_FILTER: LibraryFilter = { query: "", course: "", difficulty: "all" };

/** /quizzes: the arena library. One orange action (create); everything else is quiet. */
export function QuizLibrary() {
  const t = useT();
  const storage = useCreatorStorage();
  const { items, setItems, reload, failed: loadFailed } = useQuizList();
  const { start, pending, failed } = useStartSession();
  const [filter, setFilter] = useState<LibraryFilter>(NO_FILTER);
  const [confirming, setConfirming] = useState<QuizListItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "error"; key: number } | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  const courses = useMemo(() => coursesOf(items ?? []), [items]);
  const visible = useMemo(() => filterQuizzes(items ?? [], filter), [items, filter]);
  const filtered = filter.query !== "" || filter.course !== "" || filter.difficulty !== "all";

  const noticeSeq = useRef(0);
  const notify = (text: string, tone: "ok" | "error") => setNotice({ text, tone, key: ++noticeSeq.current });

  // Toasts step aside after a few seconds.
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(id);
  }, [notice]);

  // Bring a freshly duplicated arena into view, then let the highlight fade.
  useEffect(() => {
    if (!highlightId) return;
    rowRefs.current.get(highlightId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const id = window.setTimeout(() => setHighlightId(null), 2600);
    return () => window.clearTimeout(id);
  }, [highlightId]);

  async function handleDuplicate(quiz: QuizListItem) {
    setBusyId(quiz.id);
    try {
      const copy = await duplicateQuiz(storage, quiz.id, t("creator.library.copySuffix"));
      if (!copy) throw new Error("not_found");
      setFilter(NO_FILTER);
      setItems((current) => [copy, ...(current ?? [])]);
      setHighlightId(copy.id);
      notify(t("creator.library.duplicated", { title: quiz.title }), "ok");
    } catch {
      notify(t("creator.library.actionFailed"), "error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(quiz: QuizListItem) {
    setConfirming(null);
    setBusyId(quiz.id);
    try {
      await deleteQuiz(storage, quiz.id);
      setItems((current) => (current ?? []).filter((q) => q.id !== quiz.id));
      notify(t("creator.library.deleted", { title: quiz.title }), "ok");
    } catch {
      notify(t("creator.library.actionFailed"), "error");
      void reload();
    } finally {
      setBusyId(null);
    }
  }

  // A library that failed to load is not an empty one: offer a retry, not "create your first arena".
  const unavailable = loadFailed && (items === null || items.length === 0);
  const empty = !unavailable && items !== null && items.length === 0;

  return (
    <>
      <DeskHeader
        title={t("creator.nav.quizzes")}
        subtitle={
          items && !empty && !unavailable
            ? t("creator.library.subtitle", { count: items.length, courses: courses.length })
            : undefined
        }
        actions={
          // The empty state carries its own call to action; one orange button per view.
          empty ? undefined : (
            <>
              <NusaLink
                href="/quizzes/new?mode=ai"
                variant="desk-quiet"
                icon={<Sparkles size={18} aria-hidden="true" />}
              >
                {t("creator.generateAi")}
              </NusaLink>
              <NusaLink href="/quizzes/new" variant="energy" icon={<Plus size={18} aria-hidden="true" />}>
                {t("creator.quickCreate")}
              </NusaLink>
            </>
          )
        }
      />

      <div className="px-5 pt-7 pb-20 sm:px-10">
        {unavailable ? (
          <div role="alert" className="flex flex-wrap items-center gap-4 py-10">
            <p className="font-bold text-desk-text">{t("creator.library.loadFailed")}</p>
            <NusaButton
              variant="desk-quiet"
              size="sm"
              icon={<RefreshCw size={16} aria-hidden="true" />}
              onClick={() => void reload()}
            >
              {t("common.retry")}
            </NusaButton>
          </div>
        ) : items === null ? (
          <p className="flex items-center gap-3 py-10 text-sm font-semibold text-desk-muted">
            <NusaSpinner /> {t("creator.library.loading")}
          </p>
        ) : empty ? (
          <LibraryEmpty />
        ) : (
          <>
            <LibraryToolbar filter={filter} courses={courses} resultCount={visible.length} onChange={setFilter} />

            <div className="nf nf-lg nf-desk mt-6">
              {/* Column labels for the wide table layout; each row repeats them for screen readers where needed. */}
              <div
                aria-hidden="true"
                className={cn(
                  "hidden gap-x-5 border-b border-desk-line px-7 pt-5 pb-3 text-[13px] font-bold text-desk-muted min-[85rem]:grid",
                  LIBRARY_COLUMNS,
                )}
              >
                <span>{t("creator.library.columns.course")}</span>
                <span>{t("creator.library.columns.arena")}</span>
                <span>{t("creator.library.columns.questions")}</span>
                <span>{t("creator.library.columns.difficulty")}</span>
                <span>{t("creator.library.columns.updated")}</span>
                <span />
              </div>

              {visible.length === 0 ? (
                <div className="px-7 py-12">
                  <p className="font-bold text-desk-text">{t("creator.library.noResults")}</p>
                  <p className="mt-1 text-sm text-desk-muted">{t("creator.library.noResultsHint")}</p>
                  {filtered && (
                    <NusaButton variant="desk-quiet" size="sm" className="mt-5" onClick={() => setFilter(NO_FILTER)}>
                      {t("creator.library.clearFilters")}
                    </NusaButton>
                  )}
                </div>
              ) : (
                <ul aria-label={t("creator.nav.quizzes")}>
                  {visible.map((quiz) => (
                    <QuizRow
                      key={quiz.id}
                      ref={(el) => {
                        if (el) rowRefs.current.set(quiz.id, el);
                        else rowRefs.current.delete(quiz.id);
                      }}
                      quiz={quiz}
                      highlighted={highlightId === quiz.id}
                      starting={pending === quiz.id}
                      startError={failed?.quizId === quiz.id ? failed.code : null}
                      busy={busyId === quiz.id || (pending !== null && pending !== quiz.id)}
                      onStart={() => void start(quiz.id)}
                      onDuplicate={() => void handleDuplicate(quiz)}
                      onDelete={() => setConfirming(quiz)}
                    />
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      {/* Toast: the live region stays mounted so screen readers hear every change. Centred on the canvas (the rail is 248px from lg). */}
      <div
        role="status"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4 lg:pl-[248px]"
      >
        {notice && (
          <p
            key={notice.key}
            className="nf nf-md nf-solid flex max-w-[min(92vw,40rem)] items-center gap-3 px-5 py-3.5 text-sm font-semibold text-kapas drop-shadow-[0_10px_18px_rgb(6_20_51/0.3)]"
          >
            {notice.tone === "ok" ? (
              <Check size={18} aria-hidden="true" className="shrink-0 text-success" />
            ) : (
              <CircleAlert size={18} aria-hidden="true" className="shrink-0 text-sun" />
            )}
            {notice.text}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={confirming !== null}
        surface="desk"
        tone="danger"
        title={confirming ? t("creator.library.deleteTitle", { title: confirming.title }) : ""}
        body={t("creator.library.deleteBody")}
        confirmLabel={t("creator.library.deleteConfirm")}
        onCancel={() => setConfirming(null)}
        onConfirm={() => confirming && void handleDelete(confirming)}
      />
    </>
  );
}
