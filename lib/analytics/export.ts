/**
 * Analytics exports.
 *
 * CSV layout (decision): ONE file with titled sections, not several files.
 *   1. Ringkasan sesi              key / value rows
 *   2. Peringkat mahasiswa         one row per student
 *   3. Analisis per soal           one row per question, with a share column per option
 *   4. Capaian learning outcome    one row per learning outcome
 *   5. Capaian per topik           one row per topic
 * Sections are separated by an empty row and start with a title row, so the file opens
 * as one readable sheet in Excel or Google Sheets and a browser saves a single download.
 * `studentRows` / `questionRows` stay exported for tools that need one flat table.
 *
 * Encoding: UTF-8 with BOM (Excel otherwise mis-reads "é", "—", "→"). Line ending CRLF
 * (RFC 4180). Fields with the delimiter, quotes or line breaks are quoted, quotes doubled.
 * Cells that start with = + - @ (e.g. a nickname) are prefixed with ' so spreadsheets
 * never evaluate them as formulas (CSV injection).
 *
 * Dialect: Excel splits columns with the OS list separator, which is ";" (and a decimal
 * comma) on Indonesian regional settings and "," (decimal point) on English ones. The
 * page picks the dialect from the UI language; numbers are whole percents and seconds
 * with one decimal, written with the dialect's decimal separator.
 *
 * PDF is declared in the registry but not implemented yet; the UI shows it as "segera hadir".
 */

import type { Difficulty, QuestionType } from "@/lib/game/types";
import { QUESTION_TYPES, DIFFICULTIES } from "@/lib/game/types";
import type { Translator } from "@/lib/i18n/config";
import type { QuestionStatus, SessionAnalytics } from "./compute";
import { slotLetter, toPercent } from "./format";

/* ------------------------------------------------------------------ */
/* Labels (all copy comes from locales, via the page's translator)     */
/* ------------------------------------------------------------------ */

export interface CsvLabels {
  sections: { summary: string; students: string; questions: string; outcomes: string; topics: string };
  summary: {
    quiz: string;
    course: string;
    className: string;
    sessionId: string;
    roomCode: string;
    host: string;
    startedAt: string;
    participants: string;
    overallAccuracy: string;
    completion: string;
    avgResponse: string;
    questionsPlayed: string;
    questionsTotal: string;
  };
  columns: {
    rank: string;
    nickname: string;
    score: string;
    correct: string;
    answered: string;
    questions: string;
    accuracy: string;
    avgTime: string;
    bestStreak: string;
    number: string;
    topic: string;
    learningOutcome: string;
    type: string;
    prompt: string;
    status: string;
    difficulty: string;
    noAnswer: string;
    key: string;
    misconception: string;
    misconceptionShare: string;
    optionShare: (letter: string) => string;
    code: string;
    questionNumbers: string;
  };
  status: Record<QuestionStatus, string>;
  difficulty: Record<Difficulty, string>;
  type: Record<QuestionType, string>;
  general: string;
  other: string;
}

export function csvLabels(t: Translator): CsvLabels {
  const record = <K extends string>(keys: readonly K[], fn: (k: K) => string) =>
    Object.fromEntries(keys.map((k) => [k, fn(k)])) as Record<K, string>;
  return {
    sections: {
      summary: t("analytics.csv.sectionSummary"),
      students: t("analytics.csv.sectionStudents"),
      questions: t("analytics.csv.sectionQuestions"),
      outcomes: t("analytics.csv.sectionOutcomes"),
      topics: t("analytics.csv.sectionTopics"),
    },
    summary: {
      quiz: t("analytics.csv.quiz"),
      course: t("analytics.csv.course"),
      className: t("analytics.csv.className"),
      sessionId: t("analytics.csv.sessionId"),
      roomCode: t("analytics.csv.roomCode"),
      host: t("analytics.csv.host"),
      startedAt: t("analytics.csv.startedAt"),
      participants: t("analytics.csv.participants"),
      overallAccuracy: t("analytics.csv.overallAccuracy"),
      completion: t("analytics.csv.completion"),
      avgResponse: t("analytics.csv.avgResponse"),
      questionsPlayed: t("analytics.csv.questionsPlayed"),
      questionsTotal: t("analytics.csv.questionsTotal"),
    },
    columns: {
      rank: t("analytics.csv.rank"),
      nickname: t("analytics.csv.nickname"),
      score: t("analytics.csv.score"),
      correct: t("analytics.csv.correct"),
      answered: t("analytics.csv.answered"),
      questions: t("analytics.csv.questions"),
      accuracy: t("analytics.csv.accuracy"),
      avgTime: t("analytics.csv.avgTime"),
      bestStreak: t("analytics.csv.bestStreak"),
      number: t("analytics.csv.number"),
      topic: t("analytics.csv.topic"),
      learningOutcome: t("analytics.csv.learningOutcome"),
      type: t("analytics.csv.type"),
      prompt: t("analytics.csv.prompt"),
      status: t("analytics.csv.status"),
      difficulty: t("analytics.csv.difficulty"),
      noAnswer: t("analytics.csv.noAnswer"),
      key: t("analytics.csv.key"),
      misconception: t("analytics.csv.misconception"),
      misconceptionShare: t("analytics.csv.misconceptionShare"),
      optionShare: (letter) => t("analytics.csv.optionShare", { letter }),
      code: t("analytics.csv.code"),
      questionNumbers: t("analytics.csv.questionNumbers"),
    },
    status: {
      played: t("analytics.csv.statusPlayed"),
      skipped: t("analytics.csv.statusSkipped"),
      unplayed: t("analytics.csv.statusUnplayed"),
    },
    difficulty: record(DIFFICULTIES, (d) => t(`editor.difficulties.${d}`)),
    type: record(QUESTION_TYPES, (type) => t(`editor.types.${type}`)),
    general: t("analytics.generalTopic"),
    other: t("analytics.otherResponses"),
  };
}

/* ------------------------------------------------------------------ */
/* CSV primitives                                                      */
/* ------------------------------------------------------------------ */

export type CsvDialect = "comma" | "semicolon";
export type Cell = string | number | null | undefined;

const DIALECTS: Record<CsvDialect, { delimiter: string; decimal: string }> = {
  comma: { delimiter: ",", decimal: "." },
  semicolon: { delimiter: ";", decimal: "," },
};

export const CSV_BOM = "﻿";
const FORMULA_START = /^[=+\-@\t\r]/;

export function escapeCell(value: Cell, dialect: CsvDialect = "comma"): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return String(value).replace(".", DIALECTS[dialect].decimal);
  }
  let text = FORMULA_START.test(value) ? `'${value}` : value;
  const { delimiter } = DIALECTS[dialect];
  if (text.includes(delimiter) || /["\r\n]/.test(text) || text !== text.trim()) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsvText(rows: Cell[][], dialect: CsvDialect = "comma"): string {
  const { delimiter } = DIALECTS[dialect];
  return rows.map((row) => row.map((cell) => escapeCell(cell, dialect)).join(delimiter)).join("\r\n");
}

const pct = (ratio: number | null) => (ratio === null ? null : toPercent(ratio));
/** Seconds with one decimal, as a number so the dialect decides the separator. */
const secs = (ms: number | null) => (ms === null ? null : Math.round(ms / 100) / 10);

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

export interface CsvOptions {
  labels: CsvLabels;
  dialect?: CsvDialect;
  /** Session start as the lecturer reads it (campus time); defaults to ISO 8601. */
  formatDate?: (epochMs: number) => string;
}

export function summaryRows(a: SessionAnalytics, { labels, formatDate }: CsvOptions): Cell[][] {
  const s = labels.summary;
  const date =
    a.session.startedAt === null ? null : (formatDate ?? ((ms) => new Date(ms).toISOString()))(a.session.startedAt);
  return [
    [s.quiz, a.quiz.title],
    [s.course, [a.quiz.courseCode, a.quiz.courseName].filter(Boolean).join(" ")],
    [s.className, a.quiz.className],
    [s.sessionId, a.session.id],
    [s.roomCode, a.session.roomCode],
    [s.host, a.session.hostName],
    [s.startedAt, date],
    [s.participants, a.overview.participants],
    [s.overallAccuracy, pct(a.overview.overallAccuracy)],
    [s.completion, pct(a.overview.completionRate)],
    [s.avgResponse, secs(a.overview.averageResponseMs)],
    // Two numeric rows, never "10/10": Excel would read that as a date.
    [s.questionsPlayed, a.overview.playedQuestions],
    [s.questionsTotal, a.quiz.totalQuestions],
  ];
}

export function studentRows(a: SessionAnalytics, { labels }: CsvOptions): Cell[][] {
  const c = labels.columns;
  return [
    [c.rank, c.nickname, c.score, c.correct, c.answered, c.questions, c.accuracy, c.avgTime, c.bestStreak],
    ...a.students.map((s) => [
      s.rank,
      s.nickname,
      s.score,
      s.correct,
      s.answered,
      s.questions,
      pct(s.accuracy),
      secs(s.averageResponseMs),
      s.bestStreak,
    ]),
  ];
}

export function questionRows(a: SessionAnalytics, { labels }: CsvOptions): Cell[][] {
  const c = labels.columns;
  const optionSlots = Math.max(
    0,
    ...a.questions.flatMap((q) => q.distribution.map((b) => (b.slot === null ? -1 : b.slot))),
  );
  const letters = a.questions.some((q) => q.distribution.some((b) => b.slot !== null))
    ? Array.from({ length: optionSlots + 1 }, (_, i) => slotLetter(i))
    : [];

  const header: Cell[] = [
    c.number,
    c.topic,
    c.learningOutcome,
    c.type,
    c.prompt,
    c.status,
    c.accuracy,
    c.difficulty,
    c.answered,
    c.noAnswer,
    c.avgTime,
    c.key,
    c.misconception,
    c.misconceptionShare,
    ...letters.map((l) => c.optionShare(l)),
  ];
  const rows = a.questions.map((q) => {
    const key =
      q.correctText ??
      q.distribution
        .filter((b) => b.isCorrect && b.slot !== null)
        .map((b) => slotLetter(b.slot!))
        .join(" ");
    const m = q.misconception;
    const misconception = m ? (m.slot !== null ? `${slotLetter(m.slot)}. ${m.label}` : m.label) : null;
    const shares = letters.map((_, i) => {
      const bucket = q.distribution.find((b) => b.slot === i);
      return bucket ? toPercent(bucket.share) : null;
    });
    return [
      q.number,
      q.topic ?? labels.general,
      q.learningOutcome ?? labels.general,
      labels.type[q.type],
      q.prompt,
      labels.status[q.status],
      pct(q.accuracy),
      q.difficulty ? labels.difficulty[q.difficulty] : null,
      q.status === "played" ? q.answered : null,
      q.status === "played" ? q.noAnswer : null,
      secs(q.averageResponseMs),
      key || null,
      misconception,
      m ? toPercent(m.share) : null,
      ...shares,
    ] satisfies Cell[];
  });
  return [header, ...rows];
}

export function outcomeRows(a: SessionAnalytics, { labels }: CsvOptions): Cell[][] {
  const c = labels.columns;
  return [
    [c.code, c.learningOutcome, c.questionNumbers, c.accuracy, c.avgTime, c.difficulty],
    ...a.learningOutcomes.map((g) => [
      g.code,
      g.description ?? labels.general,
      g.questionNumbers.join(", "),
      pct(g.accuracy),
      secs(g.averageResponseMs),
      g.difficulty ? labels.difficulty[g.difficulty] : null,
    ]),
  ];
}

export function topicRows(a: SessionAnalytics, { labels }: CsvOptions): Cell[][] {
  const c = labels.columns;
  return [
    [c.topic, c.questionNumbers, c.accuracy, c.avgTime, c.difficulty],
    ...a.topics.map((g) => [
      g.label ?? labels.general,
      g.questionNumbers.join(", "),
      pct(g.accuracy),
      secs(g.averageResponseMs),
      g.difficulty ? labels.difficulty[g.difficulty] : null,
    ]),
  ];
}

/** The whole report as one sectioned CSV string, BOM included. */
export function toCSV(a: SessionAnalytics, options: CsvOptions): string {
  const { sections } = options.labels;
  const blocks: Array<[string, Cell[][]]> = [
    [sections.summary, summaryRows(a, options)],
    [sections.students, studentRows(a, options)],
    [sections.questions, questionRows(a, options)],
    [sections.outcomes, outcomeRows(a, options)],
    [sections.topics, topicRows(a, options)],
  ];
  const rows: Cell[][] = [];
  blocks.forEach(([title, block], i) => {
    if (i > 0) rows.push([]);
    rows.push([title], ...block);
  });
  return CSV_BOM + toCsvText(rows, options.dialect) + "\r\n";
}

/* ------------------------------------------------------------------ */
/* Format registry                                                     */
/* ------------------------------------------------------------------ */

export type ExportFormatId = "csv" | "pdf";

interface ExportFormatBase {
  id: ExportFormatId;
  extension: string;
  mimeType: string;
}

export type ExportFormat =
  | (ExportFormatBase & { status: "ready"; build: (analytics: SessionAnalytics, options: CsvOptions) => Blob })
  /** Declared so the UI and file naming already know about it; no renderer yet. */
  | (ExportFormatBase & { status: "planned" });

export const EXPORT_FORMATS: Record<ExportFormatId, ExportFormat> = {
  csv: {
    id: "csv",
    extension: "csv",
    mimeType: "text/csv;charset=utf-8",
    status: "ready",
    build: (analytics, options) => new Blob([toCSV(analytics, options)], { type: "text/csv;charset=utf-8" }),
  },
  pdf: { id: "pdf", extension: "pdf", mimeType: "application/pdf", status: "planned" },
};

const slug = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

/** "nusaquest_comp6716-la01_os-battle-scheduling-concurrency_2026-09-28.csv" */
export function exportFileName(a: SessionAnalytics, format: ExportFormatId, dateStamp?: string): string {
  const course = slug([a.quiz.courseCode, a.quiz.className].filter(Boolean).join(" "));
  const stamp =
    dateStamp ?? (a.session.startedAt === null ? "demo" : new Date(a.session.startedAt).toISOString().slice(0, 10));
  return (
    ["nusaquest", course, slug(a.quiz.title), stamp].filter(Boolean).join("_") + `.${EXPORT_FORMATS[format].extension}`
  );
}
