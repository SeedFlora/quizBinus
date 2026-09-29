/**
 * Post-game analytics for lecturers.
 *
 * `computeSessionAnalytics(state)` turns a serialized GameEngine state into everything
 * the analytics page and the exports show. It is pure and deterministic: the same
 * EngineState always yields the same numbers (records are ordered by submit time and
 * player id before grouping), so a session hosted in this browser, a server report
 * (live or from Postgres) and the demo simulation all go through exactly this code.
 *
 * Definitions (kept explicit because lecturers will quote them):
 *   eligible      players present when the question closed (reveal.results), minus kicked players
 *   accuracy      questions and the session: correct / answered, the same figure the host
 *                 saw at the reveal and the session history lists. Non-answers are
 *                 reported separately (completion), not folded into accuracy.
 *                 students: correct / questions they were present for, the same figure
 *                 each student saw on their own final screen. Polls have no accuracy.
 *   completion    answers received / answers expected, over every played question (polls included)
 *   response time mean of submitted answers on gradable questions (polls excluded)
 *   difficulty    item difficulty index P = accuracy, in the bands Indonesian lecturers already
 *                 use (Arikunto): P > 0.70 mudah, 0.30 < P ≤ 0.70 sedang, P ≤ 0.30 sulit
 *   misconception the incorrect response chosen by the most players on a question
 */

import type { EngineState } from "@/lib/game/engine";
import { correctAnswerText, evaluateAnswer, normalizeText } from "@/lib/game/evaluate";
import type {
  AnswerRecord,
  Difficulty,
  EndReason,
  GamePhase,
  PlayerState,
  Question,
  QuestionType,
  Quiz,
} from "@/lib/game/types";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export const DIFFICULTY_BANDS = {
  /** Accuracy above this is "mudah". */
  easyAbove: 0.7,
  /** Accuracy at or below this is "sulit". */
  hardAtMost: 0.3,
} as const;

/** Typed responses (short answer, numeric, ordering) keep this many groups before "other". */
export const TYPED_RESPONSE_GROUPS = 4;

export type SessionStatus = "finished" | "ended" | "in_progress";
export type QuestionStatus = "played" | "skipped" | "unplayed";

export interface ResponseBucket {
  /** Answer id for option questions; the normalized response for typed ones; "__other" for the tail. */
  key: string;
  /** Option text or the response as a student typed it. Empty for the "other" bucket. */
  label: string;
  /** Answer slot (0-based, authored order) for option questions; null for typed responses. */
  slot: number | null;
  count: number;
  /** count / answered. Multiple-select shares can sum past 1. */
  share: number;
  isCorrect: boolean;
  isOther: boolean;
}

export interface QuestionAnalytics {
  id: string;
  /** 1-based, as shown to students ("Soal 2"). */
  number: number;
  type: QuestionType;
  prompt: string;
  topic: string | null;
  /** Resolved learning-outcome group key (see `learningOutcomeKey`). */
  learningOutcome: string | null;
  timeLimitMs: number;
  points: number;
  /** False for polls: no correct answer, so no accuracy or misconception. */
  gradable: boolean;
  status: QuestionStatus;
  eligible: number;
  answered: number;
  correct: number;
  noAnswer: number;
  accuracy: number | null;
  answerRate: number | null;
  averageResponseMs: number | null;
  difficulty: Difficulty | null;
  distribution: ResponseBucket[];
  misconception: ResponseBucket | null;
  /** Human-readable solution for typed questions (short answer, numeric, ordering). */
  correctText: string | null;
}

export interface StudentAnalytics {
  playerId: string;
  nickname: string;
  avatarSeed: string;
  rank: number;
  score: number;
  /** Gradable played questions this student was present for. */
  questions: number;
  answered: number;
  correct: number;
  accuracy: number | null;
  averageResponseMs: number | null;
  bestStreak: number;
}

export interface GroupPerformance {
  key: string;
  /** Null when nothing names the group (UI shows "Umum"). */
  label: string | null;
  /** "LO2" in "LO2 — Menganalisis…", when the label follows that convention. */
  code: string | null;
  /** The label without its code. */
  description: string | null;
  questionIds: string[];
  questionNumbers: number[];
  answered: number;
  correct: number;
  accuracy: number | null;
  averageResponseMs: number | null;
  difficulty: Difficulty | null;
  /** Keys into `SessionAnalytics.topics` covered by this group, in question order (learning outcomes only). */
  topicKeys: string[];
}

export interface QuestionHighlight {
  questionId: string;
  number: number;
  topic: string | null;
  /** accuracy (0..1) for hardest/easiest, average ms for slowest. */
  value: number;
}

export interface MisconceptionHighlight extends QuestionHighlight {
  bucket: ResponseBucket;
}

export interface SessionHighlights {
  hardest: QuestionHighlight | null;
  easiest: QuestionHighlight | null;
  slowest: QuestionHighlight | null;
  misconception: MisconceptionHighlight | null;
}

export interface SessionAnalytics {
  session: {
    id: string;
    roomCode: string;
    hostName: string;
    phase: GamePhase;
    status: SessionStatus;
    endedReason: EndReason | null;
    createdAt: number;
    startedAt: number | null;
    endedAt: number | null;
    durationMs: number | null;
  };
  quiz: {
    id: string;
    title: string;
    courseCode: string;
    courseName: string;
    className: string | null;
    lecturer: string | null;
    topic: string | null;
    learningOutcome: string | null;
    totalQuestions: number;
  };
  overview: {
    participants: number;
    overallAccuracy: number | null;
    completionRate: number | null;
    averageResponseMs: number | null;
    playedQuestions: number;
    gradedQuestions: number;
    skippedQuestions: number;
    expectedResponses: number;
    responses: number;
    /** Answers on gradable questions: the overall accuracy denominator. */
    gradedResponses: number;
    correctResponses: number;
    /** Students who answered every played question they were present for. */
    fullyCompleted: number;
  };
  questions: QuestionAnalytics[];
  students: StudentAnalytics[];
  learningOutcomes: GroupPerformance[];
  topics: GroupPerformance[];
  highlights: SessionHighlights;
}

/* ------------------------------------------------------------------ */
/* Small helpers (exported for tests and the export module)            */
/* ------------------------------------------------------------------ */

export function difficultyFor(accuracy: number | null): Difficulty | null {
  if (accuracy === null) return null;
  if (accuracy > DIFFICULTY_BANDS.easyAbove) return "mudah";
  if (accuracy <= DIFFICULTY_BANDS.hardAtMost) return "sulit";
  return "sedang";
}

/** Group key for learning-outcome performance: question LO, else course LO, else topic. */
export function learningOutcomeKey(question: Question, quiz: Quiz): string | null {
  return clean(question.learningOutcome) ?? clean(quiz.course.learningOutcome) ?? topicKey(question, quiz);
}

export function topicKey(question: Question, quiz: Quiz): string | null {
  return clean(question.topic) ?? clean(quiz.topic);
}

const LO_PATTERN = /^\s*((?:sub-)?(?:c?lo|cpmk|cpl)[\s-]*\d+(?:\.\d+)*)\s*[—–:\-.]\s*(.+)$/i;

/** Splits "LO2 — Menganalisis…" into { code: "LO2", description: "Menganalisis…" }. */
export function splitOutcomeLabel(label: string | null): { code: string | null; description: string | null } {
  if (!label) return { code: null, description: null };
  const match = LO_PATTERN.exec(label);
  if (!match) return { code: null, description: label.trim() };
  return { code: match[1]!.replace(/\s+/g, "").toUpperCase(), description: match[2]!.trim() };
}

function clean(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : null);
const mean = (values: number[]) =>
  values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;

/** Stable order so grouping and labels never depend on object insertion order. */
function orderedRecords(records: AnswerRecord[]): AnswerRecord[] {
  return [...records].sort((a, b) => a.submittedAt - b.submittedAt || a.playerId.localeCompare(b.playerId));
}

/* ------------------------------------------------------------------ */
/* Per-question                                                        */
/* ------------------------------------------------------------------ */

function questionStatus(state: EngineState, question: Question, index: number): QuestionStatus {
  if (state.skipped.includes(question.id)) return "skipped";
  if (state.reveals[question.id]) return "played";
  // Rehydrated states may lack reveals: every question before the current one was
  // closed, and the current one was closed once the flow moved past "question".
  if (state.questionIndex < 0) return "unplayed";
  if (index < state.questionIndex) return "played";
  if (index === state.questionIndex) {
    const closedPhases: GamePhase[] = ["reveal", "leaderboard", "finished"];
    return closedPhases.includes(state.phase) ? "played" : "unplayed";
  }
  return "unplayed";
}

function isCorrectRecord(question: Question, record: AnswerRecord): boolean {
  return record.isCorrect ?? evaluateAnswer(question, record.payload).isCorrect;
}

function optionDistribution(question: Question, records: AnswerRecord[]): ResponseBucket[] {
  const options = [...question.answers].sort((a, b) => a.position - b.position);
  const counts = new Map(options.map((a) => [a.id, 0]));
  for (const r of records) {
    if (r.payload.kind !== "choice") continue;
    for (const id of new Set(r.payload.answerIds)) if (counts.has(id)) counts.set(id, counts.get(id)! + 1);
  }
  const gradable = question.type !== "poll";
  return options.map((a, slot) => {
    const count = counts.get(a.id) ?? 0;
    return {
      key: a.id,
      label: a.text,
      slot,
      count,
      share: ratio(count, records.length) ?? 0,
      isCorrect: gradable && a.isCorrect,
      isOther: false,
    };
  });
}

function typedResponse(question: Question, record: AnswerRecord): { key: string; label: string } | null {
  const p = record.payload;
  switch (p.kind) {
    case "text": {
      const key = normalizeText(p.value);
      return key ? { key, label: p.value.trim() } : null;
    }
    case "number":
      return Number.isFinite(p.value)
        ? { key: String(p.value), label: `${p.value}${question.numeric?.unit ? ` ${question.numeric.unit}` : ""}` }
        : null;
    case "order": {
      const text = new Map(question.answers.map((a) => [a.id, a.text]));
      return { key: p.answerIds.join(">"), label: p.answerIds.map((id) => text.get(id) ?? "?").join(" → ") };
    }
    case "choice":
      return null;
  }
}

function typedDistribution(question: Question, records: AnswerRecord[]): ResponseBucket[] {
  const groups = new Map<string, { label: string; count: number; isCorrect: boolean; first: number }>();
  records.forEach((r, i) => {
    const response = typedResponse(question, r);
    if (!response) return;
    const group = groups.get(response.key);
    if (group) group.count += 1;
    else
      groups.set(response.key, { label: response.label, count: 1, isCorrect: isCorrectRecord(question, r), first: i });
  });
  const sorted = [...groups].sort(
    // Correct groups first when tied so the solution is never buried in "other".
    ([, a], [, b]) => b.count - a.count || Number(b.isCorrect) - Number(a.isCorrect) || a.first - b.first,
  );
  const head = sorted.slice(0, TYPED_RESPONSE_GROUPS);
  const tail = sorted.slice(TYPED_RESPONSE_GROUPS);
  const buckets: ResponseBucket[] = head.map(([key, g]) => ({
    key,
    label: g.label,
    slot: null,
    count: g.count,
    share: ratio(g.count, records.length) ?? 0,
    isCorrect: g.isCorrect,
    isOther: false,
  }));
  if (tail.length) {
    const count = tail.reduce((sum, [, g]) => sum + g.count, 0);
    buckets.push({
      key: "__other",
      label: "",
      slot: null,
      count,
      share: ratio(count, records.length) ?? 0,
      isCorrect: false,
      isOther: true,
    });
  }
  return buckets;
}

function pickMisconception(distribution: ResponseBucket[]): ResponseBucket | null {
  let best: ResponseBucket | null = null;
  for (const b of distribution) {
    if (b.isCorrect || b.isOther || b.count === 0) continue;
    if (!best || b.count > best.count) best = b;
  }
  return best;
}

interface QuestionWork {
  question: Question;
  analytics: QuestionAnalytics;
  eligibleIds: string[];
  records: Map<string, AnswerRecord>;
}

function analyzeQuestion(
  state: EngineState,
  question: Question,
  index: number,
  active: Map<string, PlayerState>,
): QuestionWork {
  const quiz = state.quiz;
  const status = questionStatus(state, question, index);
  const gradable = question.type !== "poll";
  const bucket = state.answers[question.id] ?? {};
  const reveal = state.reveals[question.id];

  const eligibleIds =
    status !== "played"
      ? []
      : reveal
        ? [...new Set([...Object.keys(reveal.results), ...Object.keys(bucket)])].filter((id) => active.has(id)).sort()
        : [...active.keys()];
  const eligibleSet = new Set(eligibleIds);
  const records = orderedRecords(Object.values(bucket).filter((r) => eligibleSet.has(r.playerId)));
  const correct = gradable ? records.filter((r) => isCorrectRecord(question, r)).length : 0;
  const eligible = eligibleIds.length;
  const played = status === "played";

  const distribution = !played
    ? []
    : question.answers.length > 0 && question.type !== "ordering"
      ? optionDistribution(question, records)
      : typedDistribution(question, records);
  const accuracy = played && gradable ? ratio(correct, records.length) : null;

  const typedSolution = question.type === "ordering" || question.type === "short_answer" || question.type === "numeric";
  return {
    question,
    eligibleIds,
    records: new Map(records.map((r) => [r.playerId, r])),
    analytics: {
      id: question.id,
      number: index + 1,
      type: question.type,
      prompt: question.prompt,
      topic: topicKey(question, quiz),
      learningOutcome: learningOutcomeKey(question, quiz),
      timeLimitMs: question.timeLimit * 1000,
      points: question.points,
      gradable,
      status,
      eligible,
      answered: records.length,
      correct,
      noAnswer: Math.max(0, eligible - records.length),
      accuracy,
      answerRate: played ? ratio(records.length, eligible) : null,
      averageResponseMs: played && gradable ? mean(records.map((r) => r.responseTimeMs)) : null,
      difficulty: difficultyFor(accuracy),
      distribution,
      misconception: played && gradable ? pickMisconception(distribution) : null,
      correctText: typedSolution ? (correctAnswerText(question) ?? null) : null,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Groups                                                              */
/* ------------------------------------------------------------------ */

function groupBy(
  works: QuestionWork[],
  keyOf: (q: QuestionAnalytics) => string | null,
  /** Learning outcomes: split "LO2 — …" labels and list the topics they cover. */
  withTopics: boolean,
): GroupPerformance[] {
  const groups = new Map<string, { label: string | null; works: QuestionWork[] }>();
  for (const w of works) {
    const q = w.analytics;
    if (q.status !== "played" || !q.gradable) continue;
    const label = keyOf(q);
    const key = label ?? "";
    const g = groups.get(key) ?? { label, works: [] };
    g.works.push(w);
    groups.set(key, g);
  }
  return [...groups].map(([key, g]) => {
    const answered = g.works.reduce((s, w) => s + w.analytics.answered, 0);
    const correct = g.works.reduce((s, w) => s + w.analytics.correct, 0);
    const accuracy = ratio(correct, answered);
    const times = g.works.flatMap((w) => [...w.records.values()].map((r) => r.responseTimeMs));
    const { code, description } = withTopics ? splitOutcomeLabel(g.label) : { code: null, description: g.label };
    return {
      key,
      label: g.label,
      code,
      description,
      questionIds: g.works.map((w) => w.analytics.id),
      questionNumbers: g.works.map((w) => w.analytics.number),
      answered,
      correct,
      accuracy,
      averageResponseMs: mean(times),
      difficulty: difficultyFor(accuracy),
      topicKeys: withTopics ? [...new Set(g.works.map((w) => w.analytics.topic ?? ""))] : [],
    };
  });
}

/* ------------------------------------------------------------------ */
/* Highlights                                                          */
/* ------------------------------------------------------------------ */

function highlightOf(q: QuestionAnalytics, value: number): QuestionHighlight {
  return { questionId: q.id, number: q.number, topic: q.topic, value };
}

/** First item wins ties, so earlier questions are preferred: stable for identical inputs. */
function extreme<T>(items: T[], score: (item: T) => number, direction: "min" | "max"): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const item of items) {
    const s = score(item);
    if (best === null || (direction === "min" ? s < bestScore : s > bestScore)) {
      best = item;
      bestScore = s;
    }
  }
  return best;
}

function computeHighlights(questions: QuestionAnalytics[]): SessionHighlights {
  const graded = questions.filter((q) => q.status === "played" && q.gradable && q.accuracy !== null);
  const hardest = extreme(graded, (q) => q.accuracy!, "min");
  const easiest = extreme(graded, (q) => q.accuracy!, "max");
  const timed = graded.filter((q) => q.averageResponseMs !== null);
  const slowest = extreme(timed, (q) => q.averageResponseMs!, "max");
  const withMisconception = graded.filter((q) => q.misconception);
  const misconception = extreme(withMisconception, (q) => q.misconception!.share, "max");

  return {
    hardest: hardest ? highlightOf(hardest, hardest.accuracy!) : null,
    // With one question (or a flat session) "easiest" would repeat "hardest"; say nothing instead.
    easiest:
      easiest && hardest && easiest.accuracy! > hardest.accuracy! ? highlightOf(easiest, easiest.accuracy!) : null,
    slowest: slowest ? highlightOf(slowest, slowest.averageResponseMs!) : null,
    misconception: misconception
      ? { ...highlightOf(misconception, misconception.misconception!.share), bucket: misconception.misconception! }
      : null,
  };
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export function computeSessionAnalytics(state: EngineState): SessionAnalytics {
  const quiz = state.quiz;
  const activeList = Object.values(state.players)
    .filter((p) => !p.kicked)
    // Same order as the engine leaderboard: score, then faster correct answers, then earlier join.
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.totalResponseMs - b.totalResponseMs ||
        a.joinedAt - b.joinedAt ||
        a.id.localeCompare(b.id),
    );
  const active = new Map(activeList.map((p) => [p.id, p]));

  const works = quiz.questions.map((q, i) => analyzeQuestion(state, q, i, active));
  const questions = works.map((w) => w.analytics);
  const played = works.filter((w) => w.analytics.status === "played");
  const graded = played.filter((w) => w.analytics.gradable);

  /* ---- students ---- */
  const students: StudentAnalytics[] = activeList.map((p, i) => {
    let present = 0;
    let answered = 0;
    let correct = 0;
    const times: number[] = [];
    for (const w of graded) {
      if (!w.eligibleIds.includes(p.id)) continue;
      present += 1;
      const r = w.records.get(p.id);
      if (!r) continue;
      answered += 1;
      times.push(r.responseTimeMs);
      if (isCorrectRecord(w.question, r)) correct += 1;
    }
    return {
      playerId: p.id,
      nickname: p.nickname,
      avatarSeed: p.avatarSeed,
      rank: i + 1,
      score: p.score,
      questions: present,
      answered,
      correct,
      accuracy: ratio(correct, present),
      averageResponseMs: mean(times),
      bestStreak: p.bestStreak,
    };
  });

  /* ---- overview ---- */
  const expectedResponses = played.reduce((s, w) => s + w.analytics.eligible, 0);
  const responses = played.reduce((s, w) => s + w.analytics.answered, 0);
  const gradedAnswered = graded.reduce((s, w) => s + w.analytics.answered, 0);
  const correctResponses = graded.reduce((s, w) => s + w.analytics.correct, 0);
  const gradedTimes = graded.flatMap((w) => [...w.records.values()].map((r) => r.responseTimeMs));
  const fullyCompleted = activeList.filter((p) => {
    const present = played.filter((w) => w.eligibleIds.includes(p.id));
    return present.length > 0 && present.every((w) => w.records.has(p.id));
  }).length;

  const status: SessionStatus =
    state.phase === "finished" ? "finished" : state.phase === "ended" ? "ended" : "in_progress";

  return {
    session: {
      id: state.sessionId,
      roomCode: state.roomCode,
      hostName: state.hostName,
      phase: state.phase,
      status,
      endedReason: state.endedReason,
      createdAt: state.createdAt,
      startedAt: state.startedAt,
      endedAt: state.endedAt,
      durationMs:
        state.startedAt !== null && state.endedAt !== null ? Math.max(0, state.endedAt - state.startedAt) : null,
    },
    quiz: {
      id: quiz.id,
      title: quiz.title,
      courseCode: quiz.course.courseCode,
      courseName: quiz.course.courseName,
      className: clean(quiz.course.className),
      lecturer: clean(quiz.course.lecturer),
      topic: clean(quiz.topic),
      learningOutcome: clean(quiz.course.learningOutcome),
      totalQuestions: quiz.questions.length,
    },
    overview: {
      participants: activeList.length,
      overallAccuracy: ratio(correctResponses, gradedAnswered),
      completionRate: ratio(responses, expectedResponses),
      averageResponseMs: mean(gradedTimes),
      playedQuestions: played.length,
      gradedQuestions: graded.length,
      skippedQuestions: questions.filter((q) => q.status === "skipped").length,
      expectedResponses,
      responses,
      gradedResponses: gradedAnswered,
      correctResponses,
      fullyCompleted,
    },
    questions,
    students,
    learningOutcomes: groupBy(works, (q) => q.learningOutcome, true),
    topics: groupBy(works, (q) => q.topic, false),
    highlights: computeHighlights(questions),
  };
}
