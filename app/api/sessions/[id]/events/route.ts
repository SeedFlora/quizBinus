import { eventsBodySchema, sessionIdSchema } from "@/lib/validation/api";
import { apiRoute, parseParam, readJson, requestIp, respond } from "@/lib/server/http";
import { openSessionEvents } from "@/lib/server/sse";

/**
 * POST /api/sessions/[id]/events → text/event-stream of the session's GameEvents.
 * Body { playerId, token } for a player, {} for the host (cookie). The first frame is
 * always a full snapshot; a heartbeat comment follows every 15 s. See lib/server/sse.ts.
 */
export const POST = apiRoute(async (request: Request, ctx: RouteContext<"/api/sessions/[id]/events">) => {
  const id = parseParam((await ctx.params).id, sessionIdSchema);
  const body = await readJson(request, eventsBodySchema);
  const res = await openSessionEvents(id, body, request, requestIp(request));
  return res instanceof Response ? res : respond(res);
});
