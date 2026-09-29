import { sessionIdSchema } from "@/lib/validation/api";
import { apiRoute, parseParam, respond } from "@/lib/server/http";
import { getHost } from "@/lib/server/host-auth";
import { sessionReport } from "@/lib/server/game-api";

/**
 * GET /api/sessions/[id]/report → EngineState (answers, reveals, correctness) for the
 * host's analytics: from the live runtime, or the stored copy in database mode.
 */
export const GET = apiRoute(async (request: Request, ctx: RouteContext<"/api/sessions/[id]/report">) => {
  const id = parseParam((await ctx.params).id, sessionIdSchema);
  return respond(await sessionReport(id, await getHost(request)));
});
