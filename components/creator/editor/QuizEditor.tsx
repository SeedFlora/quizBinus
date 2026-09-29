"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft } from "lucide-react";
import { NusaLink } from "@/components/ui/NusaButton";
import { NusaSpinner } from "@/components/ui/NusaSpinner";
import { getQuizGenerationProvider } from "@/lib/ai";
import type { QuestionType } from "@/lib/game/types";
import { duplicateQuestion } from "@/lib/quiz/factory";
import type { QuizRepository } from "@/lib/quiz/repository";
import { parseQuiz, validateQuiz, type IssueField } from "@/lib/quiz/schema";
import { useT } from "@/lib/i18n/client";
import { AddQuestionMenu } from "./AddQuestionMenu";
import { AiReviewBanner } from "./AiReviewBanner";
import { getQuizRepository } from "@/components/creator/data";
import { hostLobbyPath, startErrorKey, startSession, StartSessionError } from "@/components/creator/start-session";
import { useCreatorStorage } from "@/components/creator/storage-context";
import { addQuestionAction, editorReducer, initialEditorState } from "./editor-state";
import { EditorTopBar } from "./EditorTopBar";
import { PhonePreview } from "./PhonePreview";
import { QuestionEditor } from "./QuestionEditor";
import { QuestionNavigator } from "./QuestionNavigator";
import { QuizDetailsSheet } from "./QuizDetailsSheet";
import { QuestionSettings, ScoringAndQuiz } from "./SettingsPanel";
import type { QuestionChange } from "./types";
import { UndoToast, type ToastMessage } from "./UndoToast";
import { useAutosave } from "./use-autosave";

type LoadState = "loading" | "ready" | "not_found" | "error";
type FocusTarget = { kind: "prompt" } | { kind: "nav" } | { kind: "field"; field: IssueField } | { kind: "title" };

function isTextField(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement)
  );
}

/**
 * The three-pane quiz editor: navigator · question · settings + live phone preview.
 * Owns loading, autosave, undo, selection, keyboard shortcuts and focus management;
 * the panes are presentational and talk back through small callbacks.
 */
export function QuizEditor({ quizId, fromAi, scaffolds = 0 }: { quizId: string; fromAi: boolean; scaffolds?: number }) {
  const t = useT();
  const router = useRouter();
  const storage = useCreatorStorage();
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const [load, setLoad] = useState<LoadState>("loading");
  const [repository, setRepository] = useState<QuizRepository | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visited, setVisited] = useState<ReadonlySet<string>>(new Set());
  const [showAllIssues, setShowAllIssues] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [aiBanner, setAiBanner] = useState(fromAi);
  const [barHeight, setBarHeight] = useState(0);

  const barRef = useRef<HTMLElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<FocusTarget | null>(null);

  const quiz = state.quiz;
  const autosave = useAutosave(quiz, state.rev, repository);

  /* ------------------------------ load ------------------------------ */

  useEffect(() => {
    let cancelled = false;
    const repo = getQuizRepository(storage);
    repo
      .get(quizId)
      .then((raw) => {
        if (cancelled) return;
        setRepository(repo);
        if (!raw) return setLoad("not_found");
        const parsed = parseQuiz(raw);
        // Never lock a lecturer out of their own quiz over a schema nit: log and continue.
        if (!parsed.ok) console.warn(`[editor] quiz ${quizId} does not match QuizSchema\n${parsed.error}`);
        const loaded = parsed.ok ? parsed.quiz : raw;
        dispatch({ type: "load", quiz: loaded });
        setSelectedId(loaded.questions[0]?.id ?? null);
        // A brand-new quiz starts where the lecturer would: naming it.
        if (!loaded.title.trim()) pendingFocus.current = { kind: "title" };
        setLoad("ready");
      })
      .catch(() => {
        if (!cancelled) setLoad("error");
      });
    return () => {
      cancelled = true;
    };
  }, [quizId, storage]);

  // The panes stick below the top bar, whose height changes as it wraps.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const observer = new ResizeObserver(
      ([entry]) => entry && setBarHeight(Math.ceil(entry.borderBoxSize[0]?.blockSize ?? bar.offsetHeight)),
    );
    observer.observe(bar);
    return () => observer.disconnect();
  }, [load]);

  /* ---------------------------- derived ----------------------------- */

  const validation = useMemo(() => (quiz ? validateQuiz(quiz) : null), [quiz]);
  const questions = useMemo(() => quiz?.questions ?? [], [quiz]);
  const currentIndex = Math.max(
    0,
    questions.findIndex((q) => q.id === selectedId),
  );
  const current = questions[currentIndex];
  const currentIssues = (current && validation?.questions[current.id]) || [];
  // Inline errors wait until the lecturer has left the question once, or asked to see them.
  const showIssues = Boolean(current && (showAllIssues || visited.has(current.id)));

  /* --------------------------- actions ------------------------------ */

  const select = useCallback(
    (id: string) => {
      if (selectedId && selectedId !== id) setVisited((prev) => new Set(prev).add(selectedId));
      setSelectedId(id);
    },
    [selectedId],
  );

  const changeCurrent: QuestionChange = useCallback(
    (update, options) => {
      if (current) dispatch({ type: "updateQuestion", id: current.id, update, structural: options?.structural });
    },
    [current],
  );

  const addQuestion = useCallback(
    (type: QuestionType) => {
      if (!quiz) return;
      const { action, question } = addQuestionAction(quiz, type, current?.id ?? null);
      dispatch(action);
      select(question.id);
      pendingFocus.current = { kind: "prompt" };
    },
    [quiz, current, select],
  );

  const duplicate = useCallback(() => {
    if (!current) return;
    const created = duplicateQuestion(current);
    dispatch({ type: "duplicateQuestion", id: current.id, created });
    select(created.id);
    pendingFocus.current = { kind: "prompt" };
  }, [current, select]);

  const remove = useCallback(() => {
    if (!current) return;
    const next = questions[currentIndex + 1] ?? questions[currentIndex - 1];
    dispatch({ type: "deleteQuestion", id: current.id });
    if (next) setSelectedId(next.id);
    setToast({ id: Date.now(), message: t("editor.deleted", { n: currentIndex + 1 }), restoreId: current.id });
    pendingFocus.current = { kind: "nav" };
  }, [current, currentIndex, questions, t]);

  const move = useCallback((id: string, delta: -1 | 1) => dispatch({ type: "moveQuestion", id, delta }), []);

  const undo = useCallback(
    (restoreId?: string) => {
      if (state.past.length === 0) return;
      dispatch({ type: "undo" });
      if (restoreId) setSelectedId(restoreId);
      setToast(null);
    },
    [state.past.length],
  );

  const jumpToIssue = useCallback(
    (questionId: string, field: IssueField) => {
      setShowAllIssues(true);
      select(questionId);
      pendingFocus.current = field === "prompt" ? { kind: "prompt" } : { kind: "field", field };
    },
    [select],
  );

  const start = async () => {
    if (!quiz || !validation || starting) return;
    if (!validation.ready) {
      setShowAllIssues(true);
      if (validation.firstInvalidQuestionId) {
        const first = validation.questions[validation.firstInvalidQuestionId]?.[0];
        if (first) jumpToIssue(validation.firstInvalidQuestionId, first.field);
      } else setDetailsOpen(true);
      return;
    }
    setStarting(true);
    setStartError(null);
    try {
      if (!(await autosave.flush())) throw new Error("save_failed");
      // Database mode: the server reads the stored quiz, hence the flush above.
      // Browser storage: the saved quiz travels with the request.
      const { sessionId } = await startSession(storage, quiz.id, quiz);
      router.push(hostLobbyPath(sessionId));
    } catch (error) {
      setStartError(
        error instanceof StartSessionError && error.code !== "unknown"
          ? t(startErrorKey(error.code))
          : error instanceof Error && error.message === "save_failed"
            ? t("editor.save.error")
            : t("editor.startFailed"),
      );
      setStarting(false);
    }
  };

  /* ------------------------ focus management ------------------------ */

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    if (target.kind === "prompt") promptRef.current?.focus();
    else if (target.kind === "title") titleRef.current?.focus();
    else if (target.kind === "nav") {
      if (selectedId) itemRefs.current.get(selectedId)?.focus();
    } else {
      centerRef.current?.parentElement
        ?.querySelector<HTMLElement>(
          `[data-field="${target.field}"] :is(input:not([type=hidden]),textarea,select,button:not(:disabled))`,
        )
        ?.focus();
    }
  });

  /* --------------------------- keyboard ----------------------------- */

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void autosave.flush();
        return;
      }
      if (detailsOpen) return;
      if (event.altKey && !mod && (event.key === "ArrowUp" || event.key === "ArrowDown") && current) {
        event.preventDefault();
        move(current.id, event.key === "ArrowUp" ? -1 : 1);
        return;
      }
      if (mod && !event.shiftKey && event.key.toLowerCase() === "z" && !isTextField(event.target)) {
        event.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [autosave, current, detailsOpen, move, undo]);

  const dismissToast = useCallback(() => setToast(null), []);

  /* ---------------------------- render ------------------------------ */

  if (load === "loading") {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center gap-3 font-semibold text-desk-muted" role="status">
        <NusaSpinner size={28} className="text-binus-500" />
        {t("editor.loading")}
      </div>
    );
  }

  if (load !== "ready" || !quiz || !validation) {
    return (
      <div className="px-5 py-16 sm:px-10">
        <p className="font-numeral text-[8rem] leading-[0.8] text-desk-line" aria-hidden="true">
          404
        </p>
        <h1 className="font-display-tight mt-4 text-3xl text-desk-text">
          {load === "not_found" ? t("editor.notFound") : t("editor.loadFailed")}
        </h1>
        {load === "not_found" && <p className="mt-2 text-desk-muted">{t("editor.notFoundBody")}</p>}
        <NusaLink href="/quizzes" variant="desk" className="mt-8" icon={<ArrowLeft size={18} aria-hidden="true" />}>
          {t("creator.nav.quizzes")}
        </NusaLink>
      </div>
    );
  }

  const paneTop = { "--editor-top": `${barHeight}px` } as CSSProperties;

  return (
    <div className="flex min-h-dvh flex-col" style={paneTop}>
      <h1 className="sr-only">{quiz.title || t("editor.untitled")}</h1>
      <header ref={barRef} className="sticky top-0 z-30 border-b border-desk-line bg-desk/95 backdrop-blur-sm">
        <EditorTopBar
          quiz={quiz}
          validation={validation}
          saveStatus={autosave.status}
          savedAt={autosave.savedAt}
          canUndo={state.past.length > 0}
          starting={starting}
          titleRef={titleRef}
          onTitle={(title) => dispatch({ type: "patchQuiz", patch: { title } })}
          onRetrySave={() => void autosave.retry()}
          onUndo={() => undo()}
          onOpenDetails={() => setDetailsOpen(true)}
          onRevealIssues={() => setShowAllIssues(true)}
          onJumpQuestion={jumpToIssue}
          onStart={() => void start()}
        />
        {startError && (
          <p role="alert" className="px-4 pb-3 text-sm font-semibold text-danger sm:px-6">
            {startError}
          </p>
        )}
      </header>

      {aiBanner && (
        <AiReviewBanner
          isMock={getQuizGenerationProvider().info.isMock}
          scaffolds={scaffolds}
          onDismiss={() => setAiBanner(false)}
        />
      )}

      {/*
        Panes follow the width the editor actually gets, not the viewport: from lg up the
        creator rail takes 248px, so a 1280px laptop leaves ~1030px. Container queries:
        < @3xl (768) one column · @3xl navigator + question, settings below ·
        @5xl (1024) three panes · @6xl (1152) roomier side panes.
      */}
      <div className="@container flex flex-1 flex-col">
        <div className="grid flex-1 @3xl:grid-cols-[232px_minmax(0,1fr)] @5xl:grid-cols-[224px_minmax(0,1fr)_304px] @6xl:grid-cols-[272px_minmax(0,1fr)_352px]">
          <aside className="relative z-20 border-b border-desk-line bg-desk-surface/55 @3xl:sticky @3xl:top-(--editor-top) @3xl:row-span-2 @3xl:h-[calc(100dvh-var(--editor-top))] @3xl:border-r @3xl:border-b-0 @5xl:row-span-1">
            <QuestionNavigator
              questions={questions}
              validation={validation}
              selectedId={current?.id ?? null}
              onSelect={select}
              onMove={move}
              onAdd={addQuestion}
              itemRefs={itemRefs}
            />
          </aside>

          <div ref={centerRef} className="@container min-w-0 px-4 pt-6 pb-10 @xl:px-8 @5xl:px-6 @5xl:pb-24 @6xl:px-8">
            {current ? (
              <QuestionEditor
                key={current.id}
                quizId={quiz.id}
                question={current}
                index={currentIndex}
                total={questions.length}
                issues={currentIssues}
                showIssues={showIssues}
                onChange={changeCurrent}
                onMove={(delta) => move(current.id, delta)}
                onDuplicate={duplicate}
                onDelete={remove}
                promptRef={promptRef}
              />
            ) : (
              <div className="nf nf-lg nf-desk mx-auto mt-10 max-w-md p-8 text-center">
                <p className="font-numeral text-[6rem] leading-[0.8] text-desk-line" aria-hidden="true">
                  00
                </p>
                <p className="mt-4 font-bold text-desk-text">{t("editor.validation.noQuestions")}</p>
                <AddQuestionMenu onAdd={addQuestion} placement="below" className="mx-auto mt-6 max-w-60" />
              </div>
            )}
          </div>

          {current && (
            // Three panes: one sticky column (settings → preview → scoring). Below that the
            // pane sits under the question, and is itself a container: wide enough, the
            // phone moves beside the settings; otherwise everything stacks.
            <aside className="@container border-t border-desk-line bg-desk-surface/55 px-4 py-6 @xl:px-8 @3xl:col-start-2 @5xl:sticky @5xl:top-(--editor-top) @5xl:col-start-3 @5xl:row-start-1 @5xl:h-[calc(100dvh-var(--editor-top))] @5xl:overflow-y-auto @5xl:border-t-0 @5xl:border-l @5xl:px-6">
              <div className="grid content-start gap-x-10 gap-y-7 @xl:grid-cols-[minmax(0,1fr)_256px]">
                <div className="@xl:col-start-1">
                  <QuestionSettings
                    key={current.id}
                    question={current}
                    issues={currentIssues}
                    showIssues={showIssues}
                    onChange={changeCurrent}
                    onChangeType={(questionType) => dispatch({ type: "changeType", id: current.id, questionType })}
                  />
                </div>
                <div className="mx-auto w-full max-w-[300px] @xl:col-start-2 @xl:row-span-2 @xl:row-start-1">
                  <PhonePreview question={current} index={currentIndex} total={questions.length} />
                </div>
                <div className="@xl:col-start-1">
                  <ScoringAndQuiz quiz={quiz} question={current} onOpenDetails={() => setDetailsOpen(true)} />
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>

      <QuizDetailsSheet
        open={detailsOpen}
        quiz={quiz}
        showIssues={showAllIssues}
        onClose={() => setDetailsOpen(false)}
        onPatch={(patch) => dispatch({ type: "patchQuiz", patch })}
        onPatchCourse={(patch) => dispatch({ type: "patchCourse", patch })}
      />

      <UndoToast toast={toast} onUndo={() => undo(toast?.restoreId)} onDismiss={dismissToast} />
    </div>
  );
}
