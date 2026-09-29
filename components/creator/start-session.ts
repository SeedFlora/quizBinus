"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { Quiz } from "@/lib/game/types";
import type { TranslationKey } from "@/lib/i18n/config";
import { getLocalQuizRepository } from "@/lib/quiz/repository";
import { validateQuiz } from "@/lib/quiz/schema";
import { getGameProvider } from "@/lib/realtime";
import type { CreateSessionResult } from "@/lib/realtime/types";
import { useCreatorStorage, type CreatorStorage } from "./storage-context";

/** Why "Mulai sesi" failed, in words a lecturer can act on; anything else is "unknown". */
export type StartErrorCode =
  | "quiz_not_found"
  | "no_questions"
  | "not_ready"
  | "unauthorized"
  | "rate_limited"
  | "server_busy"
  | "network"
  | "unknown";

export class StartSessionError extends Error {
  constructor(readonly code: StartErrorCode) {
    super(code);
    this.name = "StartSessionError";
  }
}

/** Error codes the session routes (and the providers) answer with → what the desk shows. */
const KNOWN: Record<string, StartErrorCode> = {
  quiz_not_found: "quiz_not_found",
  not_found: "quiz_not_found",
  no_questions: "no_questions",
  quiz_not_ready: "not_ready",
  unauthorized: "unauthorized",
  forbidden: "unauthorized",
  not_signed_in: "unauthorized",
  rate_limited: "rate_limited",
  server_busy: "server_busy",
  network: "network",
  timeout: "network",
};

export function startErrorCode(error: unknown): StartErrorCode {
  if (error instanceof StartSessionError) return error.code;
  // fetch() rejects with a TypeError when the server cannot be reached at all.
  if (error instanceof TypeError) return "network";
  return (error instanceof Error && KNOWN[error.message]) || "unknown";
}

export function startErrorKey(code: StartErrorCode): TranslationKey {
  return code === "unknown" ? "creator.startError" : `creator.startErrors.${code}`;
}

/**
 * "Mulai sesi": create a live session on the game server. In database mode the
 * server loads the quiz itself; in browser storage (memory mode) the quiz only
 * exists in this browser, so it travels with the request (pass `quiz` when the
 * caller already holds the latest version, e.g. the editor).
 */
export async function startSession(storage: CreatorStorage, quizId: string, quiz?: Quiz): Promise<CreateSessionResult> {
  try {
    const inline = quiz ?? (storage === "browser" ? await getLocalQuizRepository().get(quizId) : undefined);
    if (storage === "browser" && !inline) throw new StartSessionError("quiz_not_found");
    // The server refuses these too; checking here saves the lecturer a round trip.
    if (inline && inline.questions.length === 0) throw new StartSessionError("no_questions");
    if (inline && !validateQuiz(inline).ready) throw new StartSessionError("not_ready");
    return await getGameProvider().createSession(
      storage === "browser" && inline ? { quizId, quiz: inline } : { quizId },
    );
  } catch (error) {
    throw error instanceof StartSessionError ? error : new StartSessionError(startErrorCode(error));
  }
}

export const hostLobbyPath = (sessionId: string) => `/host/session/${encodeURIComponent(sessionId)}/lobby`;

export interface StartFailure {
  quizId: string;
  code: StartErrorCode;
}

export function useStartSession() {
  const router = useRouter();
  const storage = useCreatorStorage();
  /** Quiz id currently being started, so only that row shows a spinner. */
  const [pending, setPending] = useState<string | null>(null);
  /** The last failed start: which quiz, and why. */
  const [failed, setFailed] = useState<StartFailure | null>(null);

  const start = useCallback(
    async (quizId: string) => {
      setPending(quizId);
      setFailed(null);
      try {
        const { sessionId } = await startSession(storage, quizId);
        router.push(hostLobbyPath(sessionId));
      } catch (error) {
        setFailed({ quizId, code: startErrorCode(error) });
        setPending(null);
      }
    },
    [router, storage],
  );

  return { start, pending, failed };
}
