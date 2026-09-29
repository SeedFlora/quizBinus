import { QuizSchema } from "@/lib/quiz/schema";
import { MAX_QUIZ_BODY_BYTES } from "@/lib/validation/api";
import { apiRoute, readJson, respond } from "@/lib/server/http";
import { assertSameOrigin } from "@/lib/server/csrf";
import { createLecturerQuiz, creatorLecturer, listLecturerQuizzes } from "@/lib/server/creator-api";

/** GET /api/quizzes → QuizListItem[] of the signed-in lecturer (database mode). */
export const GET = apiRoute(async () => {
  const auth = await creatorLecturer();
  if (!auth.ok) return respond(auth.res);
  return respond(await listLecturerQuizzes(auth.lecturer));
});

/** POST /api/quizzes (Quiz) → 201 the stored Quiz (a readable id is replaced by a uuid). */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const auth = await creatorLecturer();
  if (!auth.ok) return respond(auth.res);
  const quiz = await readJson(request, QuizSchema, MAX_QUIZ_BODY_BYTES);
  return respond(await createLecturerQuiz(quiz, auth.lecturer));
});
