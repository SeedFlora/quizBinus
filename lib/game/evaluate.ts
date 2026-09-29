import type { AnswerPayload, PublicQuestion, Question } from "./types";
import { seededRandom } from "@/lib/random";
import { sha256Hex } from "@/lib/security/sha256";

/** Case-, accent- and punctuation-insensitive text comparison for short answers. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface Evaluation {
  /** Fully correct. Drives streaks and the "Benar!" state. */
  isCorrect: boolean;
  /** 0..1 partial credit used for scoring (multiple-choice). */
  credit: number;
  /** Polls are never scored. */
  scored: boolean;
}

export function isScored(question: Question): boolean {
  return question.type !== "poll" && question.points > 0;
}

export function correctAnswerIds(question: Question): string[] {
  if (question.type === "ordering") {
    return [...question.answers].sort((a, b) => a.position - b.position).map((a) => a.id);
  }
  return question.answers.filter((a) => a.isCorrect).map((a) => a.id);
}

export function evaluateAnswer(question: Question, payload: AnswerPayload): Evaluation {
  const scored = isScored(question);
  const miss: Evaluation = { isCorrect: false, credit: 0, scored };

  switch (question.type) {
    case "poll":
      return { isCorrect: false, credit: 0, scored: false };

    case "single":
    case "true_false": {
      if (payload.kind !== "choice" || payload.answerIds.length !== 1) return miss;
      const answer = question.answers.find((a) => a.id === payload.answerIds[0]);
      return answer?.isCorrect ? { isCorrect: true, credit: 1, scored } : miss;
    }

    case "multiple": {
      if (payload.kind !== "choice") return miss;
      const correct = new Set(correctAnswerIds(question));
      if (correct.size === 0) return miss;
      const picked = new Set(payload.answerIds);
      let hits = 0;
      let wrong = 0;
      for (const id of picked) {
        if (correct.has(id)) hits++;
        else wrong++;
      }
      const exact = hits === correct.size && wrong === 0;
      const credit = exact ? 1 : Math.max(0, (hits - wrong) / correct.size);
      return { isCorrect: exact, credit, scored };
    }

    case "short_answer": {
      if (payload.kind !== "text") return miss;
      const given = normalizeText(payload.value);
      if (!given) return miss;
      const ok = (question.acceptedAnswers ?? []).some((accepted) => normalizeText(accepted) === given);
      return ok ? { isCorrect: true, credit: 1, scored } : miss;
    }

    case "numeric": {
      if (payload.kind !== "number" || !Number.isFinite(payload.value) || !question.numeric) return miss;
      const ok = Math.abs(payload.value - question.numeric.value) <= Math.abs(question.numeric.tolerance);
      return ok ? { isCorrect: true, credit: 1, scored } : miss;
    }

    case "ordering": {
      if (payload.kind !== "order") return miss;
      const expected = correctAnswerIds(question);
      const ok = payload.answerIds.length === expected.length && payload.answerIds.every((id, i) => id === expected[i]);
      return ok ? { isCorrect: true, credit: 1, scored } : miss;
    }
  }
}

/** Structural validation: does the payload even fit this question? */
export function validatePayload(question: Question, payload: AnswerPayload): string | null {
  const ids = new Set(question.answers.map((a) => a.id));
  switch (question.type) {
    case "single":
    case "true_false":
    case "poll":
      if (payload.kind !== "choice") return "expected_choice";
      if (payload.answerIds.length !== 1) return "expected_one_choice";
      return ids.has(payload.answerIds[0]!) ? null : "unknown_answer";
    case "multiple": {
      if (payload.kind !== "choice") return "expected_choice";
      if (payload.answerIds.length === 0) return "empty_choice";
      if (new Set(payload.answerIds).size !== payload.answerIds.length) return "duplicate_choice";
      return payload.answerIds.every((id) => ids.has(id)) ? null : "unknown_answer";
    }
    case "short_answer":
      if (payload.kind !== "text") return "expected_text";
      return payload.value.trim().length > 0 && payload.value.length <= 120 ? null : "invalid_text";
    case "numeric":
      if (payload.kind !== "number") return "expected_number";
      return Number.isFinite(payload.value) ? null : "invalid_number";
    case "ordering":
      if (payload.kind !== "order") return "expected_order";
      if (payload.answerIds.length !== ids.size) return "incomplete_order";
      if (new Set(payload.answerIds).size !== ids.size) return "duplicate_order";
      return payload.answerIds.every((id) => ids.has(id)) ? null : "unknown_answer";
  }
}

/**
 * Strip every correctness hint. Ordering questions are shuffled because the authored
 * order IS the answer: stable per seed + question (every snapshot and reconnect shows
 * the same order), but `shuffleSeed` must be a SECRET (EngineState.shuffleSeed). With a
 * public seed such as the session id, a player could replay this shuffle in the
 * console and invert it. sha256 keeps one question's permutation from saying anything
 * about another's.
 */
export function toPublicQuestion(
  question: Question,
  index: number,
  total: number,
  shuffleSeed: string,
): PublicQuestion {
  let answers = [...question.answers]
    .sort((a, b) => a.position - b.position)
    .map((a) => ({ id: a.id, position: a.position, text: a.text }));

  if (question.type === "ordering") {
    // Sorted by position, `answers` is the solution; remember it by id so the check
    // below also holds when authored positions are not 0-based.
    const solution = answers.map((a) => a.id);
    const rand = seededRandom(parseInt(sha256Hex(`${shuffleSeed}:${question.id}`).slice(0, 8), 16));
    for (let i = answers.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [answers[i], answers[j]] = [answers[j]!, answers[i]!];
    }
    // Guarantee the shuffle is not accidentally the solution.
    if (answers.length > 1 && answers.every((a, i) => a.id === solution[i])) {
      answers = [...answers.slice(1), answers[0]!];
    }
    answers = answers.map((a, i) => ({ ...a, position: i }));
  }

  return {
    id: question.id,
    index,
    total,
    type: question.type,
    prompt: question.prompt,
    description: question.description,
    mediaUrl: question.mediaUrl,
    timeLimit: question.timeLimit,
    points: question.points,
    topic: question.topic,
    answers,
    selectCount: question.type === "multiple" ? question.answers.filter((a) => a.isCorrect).length : undefined,
    unit: question.numeric?.unit,
  };
}

/** Human-readable answer for reveal screens (short answer / numeric / ordering). */
export function correctAnswerText(question: Question): string | undefined {
  switch (question.type) {
    case "short_answer":
      return question.acceptedAnswers?.[0];
    case "numeric":
      return question.numeric
        ? `${question.numeric.value}${question.numeric.unit ? ` ${question.numeric.unit}` : ""}`
        : undefined;
    case "ordering":
      return [...question.answers]
        .sort((a, b) => a.position - b.position)
        .map((a) => a.text)
        .join(" → ");
    default:
      return undefined;
  }
}
