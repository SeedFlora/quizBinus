import { MAX_QUIZ_BODY_BYTES, createSessionBodySchema } from "@/lib/validation/api";
import { apiRoute, readJson, requestIp, respond } from "@/lib/server/http";
import { assertSameOrigin } from "@/lib/server/csrf";
import { getHost } from "@/lib/server/host-auth";
import { createSession, listSessions } from "@/lib/server/game-api";

/**
 * POST /api/sessions { quizId, quiz? } → 201 { sessionId, roomCode }.
 * Database mode hosts the signed-in lecturer's stored quiz; memory mode hosts the
 * quiz sent inline (it lives in the lecturer's browser) and sets the host key cookie.
 */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const host = await getHost(request);
  const body = await readJson(request, createSessionBodySchema, MAX_QUIZ_BODY_BYTES);
  return respond(await createSession(host, body, request, requestIp(request)));
});

/** GET /api/sessions → the caller's sessions, newest first (live status overlaid). */
export const GET = apiRoute(async (request: Request) => respond(await listSessions(await getHost(request))));
