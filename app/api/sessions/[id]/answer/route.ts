import { answerBodySchema, sessionIdSchema } from "@/lib/validation/api";
import { apiRoute, parseParam, readJson, respond } from "@/lib/server/http";
import { submitAnswer } from "@/lib/server/game-api";

/**
 * POST /api/sessions/[id]/answer { playerId, token, questionId, payload } → SubmitResult.
 * Response time and lateness use the server clock only; one answer per player per
 * question ("duplicate" after that). Rate limited per player (5 per 10 s).
 */
export const POST = apiRoute(async (request: Request, ctx: RouteContext<"/api/sessions/[id]/answer">) => {
  const id = parseParam((await ctx.params).id, sessionIdSchema);
  const body = await readJson(request, answerBodySchema);
  return respond(submitAnswer(id, body));
});
