import { joinBodySchema, roomCodeSchema } from "@/lib/validation/api";
import { apiRoute, json, readJson, requestIp, respond } from "@/lib/server/http";
import { joinRoom } from "@/lib/server/game-api";

/**
 * POST /api/rooms/[code]/join { nickname, avatarSeed } → 201 JoinResult.
 * The player token is returned exactly once; the server keeps only its sha256.
 * Rate limited per IP.
 */
export const POST = apiRoute(async (request: Request, ctx: RouteContext<"/api/rooms/[code]/join">) => {
  const { code } = await ctx.params;
  if (!roomCodeSchema.safeParse(code).success) return json({ ok: false, error: "not_found" }, 404);
  const body = await readJson(request, joinBodySchema);
  return respond(joinRoom(code, body, requestIp(request)));
});
