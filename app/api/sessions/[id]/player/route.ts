import { playerActionBodySchema, sessionIdSchema } from "@/lib/validation/api";
import { apiRoute, parseParam, readJson, respond } from "@/lib/server/http";
import { playerAction } from "@/lib/server/game-api";

/**
 * POST /api/sessions/[id]/player { action, playerId, token }
 *   resume   → ResumeResult (snapshot includes the player's private `self`)
 *   leave    → { ok: true }
 *   snapshot → SessionSnapshot (with `self`)
 *   summary  → PlayerSummary
 */
export const POST = apiRoute(async (request: Request, ctx: RouteContext<"/api/sessions/[id]/player">) => {
  const id = parseParam((await ctx.params).id, sessionIdSchema);
  const body = await readJson(request, playerActionBodySchema);
  return respond(playerAction(id, body));
});
