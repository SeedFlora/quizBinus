/**
 * ApiQuizRepository: QuizRepository for database mode. The lecturer's arenas live
 * in PostgreSQL behind the route handlers (/api/quizzes, cookie-authenticated), so
 * this class only speaks HTTP and validates what comes back.
 *
 *   list    GET    /api/quizzes
 *   get     GET    /api/quizzes/:id          404 → null
 *   save    PUT    /api/quizzes/:id          404 (not stored yet) → POST /api/quizzes
 *   remove  DELETE /api/quizzes/:id          404 counts as removed
 *
 * The server may assign a new uuid when saving an id it cannot store (a readable
 * seed id such as "os-battle"); `save` returns the stored quiz, id included.
 */

import { z } from "zod";
import { DIFFICULTIES, type Quiz } from "@/lib/game/types";
import type { QuizListItem, QuizRepository } from "./repository";
import { QuizSchema } from "./schema";

export type QuizApiErrorCode = "unauthorized" | "rate_limited" | "invalid" | "unavailable" | "network";

export class QuizApiError extends Error {
  constructor(
    readonly code: QuizApiErrorCode,
    readonly status?: number,
  ) {
    super(code);
    this.name = "QuizApiError";
  }
}

const ListItemSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  courseCode: z.string().catch(""),
  courseName: z.string().catch(""),
  className: z.string().optional(),
  questionCount: z.number().int().min(0),
  updatedAt: z.string(),
  difficulty: z.enum(DIFFICULTIES).catch("sedang"),
  topic: z.string().optional(),
});

// Accept a bare payload or one wrapped in a named field, whichever the route returns.
const ListResponse = z.union([
  z.array(ListItemSchema),
  z.object({ quizzes: z.array(ListItemSchema) }).transform((body) => body.quizzes),
]);
const QuizResponse = z.union([QuizSchema, z.object({ quiz: QuizSchema }).transform((body) => body.quiz)]);

/** JSON null → absent: optional domain fields are `undefined`, never `null`. */
function withoutNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutNulls);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => [k, withoutNulls(v)]),
    );
  }
  return value;
}

function errorFor(status: number): QuizApiError {
  if (status === 401 || status === 403) return new QuizApiError("unauthorized", status);
  if (status === 429) return new QuizApiError("rate_limited", status);
  if (status === 400 || status === 413 || status === 422) return new QuizApiError("invalid", status);
  return new QuizApiError("unavailable", status);
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(path, {
      ...init,
      headers: init.body ? { "content-type": "application/json", ...init.headers } : init.headers,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new QuizApiError("network");
  }
}

async function body<T>(res: Response, schema: z.ZodType<T, unknown>): Promise<T> {
  const parsed = schema.safeParse(withoutNulls(await res.json().catch(() => null)));
  if (!parsed.success) throw new QuizApiError("unavailable", res.status);
  return parsed.data;
}

const quizPath = (id: string) => `/api/quizzes/${encodeURIComponent(id)}`;

export class ApiQuizRepository implements QuizRepository {
  async list(): Promise<QuizListItem[]> {
    const res = await request("/api/quizzes");
    if (!res.ok) throw errorFor(res.status);
    return body(res, ListResponse);
  }

  async get(id: string): Promise<Quiz | null> {
    const res = await request(quizPath(id));
    if (res.status === 404) return null;
    if (!res.ok) throw errorFor(res.status);
    return body(res, QuizResponse);
  }

  async save(quiz: Quiz): Promise<Quiz> {
    const payload = JSON.stringify(quiz);
    let res = await request(quizPath(quiz.id), { method: "PUT", body: payload });
    // Not stored yet (a fresh draft) or an id the database cannot hold: create it.
    if (res.status === 404) res = await request("/api/quizzes", { method: "POST", body: payload });
    if (!res.ok) throw errorFor(res.status);
    return body(res, QuizResponse);
  }

  async remove(id: string): Promise<void> {
    const res = await request(quizPath(id), { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw errorFor(res.status);
  }
}
