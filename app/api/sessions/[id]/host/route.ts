import { hostCommandBodySchema, sessionIdSchema } from "@/lib/validation/api";
import { apiRoute, parseParam, readJson, respond } from "@/lib/server/http";
import { assertSameOrigin } from "@/lib/server/csrf";
import { getHost } from "@/lib/server/host-auth";
import { hostCommand } from "@/lib/server/game-api";

/**
 * POST /api/sessions/[id]/host { command, playerId? } → HostCommandResult.
 * Only this session's host may drive it (lib/server/host-auth.ts). Transitions are
 * idempotent at the engine: a repeated closeQuestion answers 409 invalid_phase, so
 * client timers may fire freely.
 */
export const POST = apiRoute(async (request: Request, ctx: RouteContext<"/api/sessions/[id]/host">) => {
  assertSameOrigin(request);
  const id = parseParam((await ctx.params).id, sessionIdSchema);
  const body = await readJson(request, hostCommandBodySchema);
  return respond(hostCommand(id, await getHost(request), body));
});
