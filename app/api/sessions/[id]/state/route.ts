import { sessionIdSchema } from "@/lib/validation/api";
import { apiRoute, parseParam, respond } from "@/lib/server/http";
import { getHost } from "@/lib/server/host-auth";
import { hostState } from "@/lib/server/game-api";

/** GET /api/sessions/[id]/state → public SessionSnapshot. This session's host only. */
export const GET = apiRoute(async (request: Request, ctx: RouteContext<"/api/sessions/[id]/state">) => {
  const id = parseParam((await ctx.params).id, sessionIdSchema);
  return respond(hostState(id, await getHost(request)));
});
