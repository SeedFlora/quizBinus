/**
 * QuizRepository: storage abstraction for the creator experience.
 *
 *   LocalQuizRepository  localStorage + seed quizzes (memory mode, no database needed)
 *   ApiQuizRepository    PostgreSQL through the /api/quizzes route handlers (lib/quiz/api-repository.ts)
 */

import type { Quiz } from "@/lib/game/types";
import { SEED_QUIZZES } from "@/lib/seed/quizzes";

export interface QuizListItem {
  id: string;
  title: string;
  courseCode: string;
  courseName: string;
  className?: string;
  questionCount: number;
  updatedAt: string;
  difficulty: Quiz["difficulty"];
  topic?: string;
}

export interface QuizRepository {
  list(): Promise<QuizListItem[]>;
  get(id: string): Promise<Quiz | null>;
  save(quiz: Quiz): Promise<Quiz>;
  remove(id: string): Promise<void>;
}

export function toListItem(q: Quiz): QuizListItem {
  return {
    id: q.id,
    title: q.title,
    courseCode: q.course.courseCode,
    courseName: q.course.courseName,
    className: q.course.className,
    questionCount: q.questions.length,
    updatedAt: q.updatedAt,
    difficulty: q.difficulty,
    topic: q.topic,
  };
}

const KEY = "nq:quizzes:v1";
const DELETED_KEY = "nq:quizzes:deleted:v1";

function readStore(): Record<string, Quiz> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Record<string, Quiz>;
  } catch {
    return {};
  }
}

function readDeleted(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(DELETED_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or privacy mode: keep working in memory for this page */
  }
}

/** Seeds overlaid with the lecturer's local edits. Works on server (seeds only) and client. */
export class LocalQuizRepository implements QuizRepository {
  private all(): Quiz[] {
    const store = readStore();
    const deleted = new Set(readDeleted());
    const merged = new Map<string, Quiz>();
    for (const q of SEED_QUIZZES) if (!deleted.has(q.id)) merged.set(q.id, q);
    for (const q of Object.values(store)) if (!deleted.has(q.id)) merged.set(q.id, q);
    return [...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async list() {
    return this.all().map(toListItem);
  }

  async get(id: string) {
    return this.all().find((q) => q.id === id) ?? null;
  }

  async save(quiz: Quiz) {
    const store = readStore();
    const saved = { ...quiz, updatedAt: new Date().toISOString() };
    store[quiz.id] = saved;
    write(KEY, store);
    write(
      DELETED_KEY,
      readDeleted().filter((id) => id !== quiz.id),
    );
    return saved;
  }

  async remove(id: string) {
    const store = readStore();
    delete store[id];
    write(KEY, store);
    write(DELETED_KEY, [...new Set([...readDeleted(), id])]);
  }
}

let local: LocalQuizRepository | null = null;
export function getLocalQuizRepository() {
  local ??= new LocalQuizRepository();
  return local;
}
