import "server-only";
import type { Quiz } from "@/lib/game/types";
import type { QuizListItem } from "@/lib/quiz/repository";
import { getLecturerOrNull, type Lecturer } from "@/lib/auth/lecturer";
import { isDatabaseConfigured } from "@/lib/env.server";
import { getDb } from "@/lib/db/client";
import { media } from "@/lib/db/schema";
import { QuizOwnershipError, deleteQuiz, getQuiz, listQuizzes, saveQuiz } from "@/lib/db/quizzes";
import { RATE_LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { MAX_UPLOAD_BYTES, MediaError, removeMedia, storeMedia } from "./media-store";
import { ApiError, readBodyBytes, result, type ApiResult } from "./http";

/**
 * Quiz storage and image uploads for the creator (database mode only). In memory mode
 * quizzes live in the lecturer's browser (LocalQuizRepository) and images are inline
 * data URLs, so these routes answer 404 { error: "database_not_configured" }.
 */

type ErrorBody = { ok: false; error: string };
const fail = (error: string, status: number): ApiResult<ErrorBody> => result({ ok: false, error }, status);

/** The signed-in lecturer of database mode, or the error to return. */
export async function creatorLecturer(): Promise<
  { ok: true; lecturer: Lecturer } | { ok: false; res: ApiResult<ErrorBody> }
> {
  if (!isDatabaseConfigured()) return { ok: false, res: fail("database_not_configured", 404) };
  const lecturer = await getLecturerOrNull();
  if (!lecturer) return { ok: false, res: fail("unauthorized", 401) };
  return { ok: true, lecturer };
}

function writeAllowed(lecturer: Lecturer) {
  if (!rateLimit(`quiz-write:${lecturer.id}`, RATE_LIMITS.quizWrite))
    throw new ApiError("rate_limited", 429, { ok: false });
}

/* ------------------------------------------------------------------ */
/* Quizzes                                                             */
/* ------------------------------------------------------------------ */

export async function listLecturerQuizzes(lecturer: Lecturer): Promise<ApiResult<QuizListItem[]>> {
  return result(await listQuizzes(lecturer.id));
}

export async function getLecturerQuiz(id: string, lecturer: Lecturer): Promise<ApiResult<Quiz | ErrorBody>> {
  const quiz = await getQuiz(id, lecturer.id);
  return quiz ? result(quiz) : fail("not_found", 404);
}

/**
 * POST /api/quizzes. A readable id (seed, editor draft) gets a uuid; the stored quiz
 * is returned. A uuid that belongs to another lecturer (an imported copy) is stored
 * under a fresh id instead of touching theirs.
 */
export async function createLecturerQuiz(quiz: Quiz, lecturer: Lecturer): Promise<ApiResult<Quiz>> {
  writeAllowed(lecturer);
  try {
    return result(await saveQuiz(quiz, lecturer.id), 201);
  } catch (err) {
    if (!(err instanceof QuizOwnershipError)) throw err;
    return result(await saveQuiz({ ...quiz, id: crypto.randomUUID() }, lecturer.id), 201);
  }
}

/** PUT /api/quizzes/[id]. 404 when this lecturer has no such quiz (clients then POST). */
export async function updateLecturerQuiz(
  id: string,
  quiz: Quiz,
  lecturer: Lecturer,
): Promise<ApiResult<Quiz | ErrorBody>> {
  writeAllowed(lecturer);
  if (!(await getQuiz(id, lecturer.id))) return fail("not_found", 404);
  try {
    return result(await saveQuiz({ ...quiz, id }, lecturer.id));
  } catch (err) {
    if (err instanceof QuizOwnershipError) return fail("forbidden", 403);
    throw err;
  }
}

export async function deleteLecturerQuiz(id: string, lecturer: Lecturer): Promise<ApiResult<{ ok: true } | ErrorBody>> {
  writeAllowed(lecturer);
  return (await deleteQuiz(id, lecturer.id)) ? result({ ok: true as const }) : fail("not_found", 404);
}

/* ------------------------------------------------------------------ */
/* Media                                                               */
/* ------------------------------------------------------------------ */

/** Multipart framing around the file (boundaries, part headers). */
const MULTIPART_OVERHEAD = 64 * 1024;

const MEDIA_ERROR_STATUS: Record<MediaError["code"], number> = { too_large: 413, unsupported_type: 415, empty: 400 };

/** POST /api/media, multipart field "file": one image ≤ 2 MB → { url: "/api/media/<file>" }. */
export async function uploadMedia(
  request: Request,
  lecturer: Lecturer,
): Promise<ApiResult<{ url: string } | ErrorBody>> {
  if (!rateLimit(`media:${lecturer.id}`, RATE_LIMITS.media)) return fail("rate_limited", 429);
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) return fail("invalid_body", 400);
  // Bounded read first: formData() alone would buffer any size.
  const bytes = await readBodyBytes(request, MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD);
  let form: FormData;
  try {
    form = await new Response(bytes, { headers: { "content-type": contentType } }).formData();
  } catch {
    return fail("invalid_body", 400);
  }
  const file = form.get("file");
  if (!file || typeof file === "string") return fail("missing_file", 400);

  let stored;
  try {
    stored = await storeMedia(new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    if (err instanceof MediaError) return fail(err.code, MEDIA_ERROR_STATUS[err.code]);
    throw err;
  }
  try {
    const db = getDb();
    if (db)
      await db
        .insert(media)
        .values({ ownerId: lecturer.id, fileName: stored.fileName, mime: stored.mime, bytes: stored.bytes });
  } catch (err) {
    // No orphan files: the row is what ties a file to its owner.
    await removeMedia(stored.fileName);
    throw err;
  }
  return result({ url: `/api/media/${stored.fileName}` }, 201);
}
