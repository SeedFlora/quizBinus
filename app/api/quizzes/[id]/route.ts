import { QuizSchema } from "@/lib/quiz/schema";
import { MAX_QUIZ_BODY_BYTES, snapshotIdSchema } from "@/lib/validation/api";
import { apiRoute, parseParam, readJson, respond } from "@/lib/server/http";
import { assertSameOrigin } from "@/lib/server/csrf";
import { creatorLecturer, deleteLecturerQuiz, getLecturerQuiz, updateLecturerQuiz } from "@/lib/server/creator-api";

/** GET /api/quizzes/[id] → Quiz (with correct answers: the owner's editor). 404 when not theirs. */
export const GET = apiRoute(async (_request: Request, ctx: RouteContext<"/api/quizzes/[id]">) => {
  const id = parseParam((await ctx.params).id, snapshotIdSchema);
  const auth = await creatorLecturer();
  if (!auth.ok) return respond(auth.res);
  return respond(await getLecturerQuiz(id, auth.lecturer));
});

/** PUT /api/quizzes/[id] (Quiz) → the stored Quiz. 404 when not stored yet (then POST). */
export const PUT = apiRoute(async (request: Request, ctx: RouteContext<"/api/quizzes/[id]">) => {
  assertSameOrigin(request);
  const id = parseParam((await ctx.params).id, snapshotIdSchema);
  const auth = await creatorLecturer();
  if (!auth.ok) return respond(auth.res);
  const quiz = await readJson(request, QuizSchema, MAX_QUIZ_BODY_BYTES);
  return respond(await updateLecturerQuiz(id, quiz, auth.lecturer));
});

/** DELETE /api/quizzes/[id] → { ok: true }; 404 when there was nothing to delete. */
export const DELETE = apiRoute(async (request: Request, ctx: RouteContext<"/api/quizzes/[id]">) => {
  assertSameOrigin(request);
  const id = parseParam((await ctx.params).id, snapshotIdSchema);
  const auth = await creatorLecturer();
  if (!auth.ok) return respond(auth.res);
  return respond(await deleteLecturerQuiz(id, auth.lecturer));
});
