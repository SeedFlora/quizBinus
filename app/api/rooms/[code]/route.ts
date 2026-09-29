import { roomCodeSchema } from "@/lib/validation/api";
import { apiRoute, json, requestIp, respond } from "@/lib/server/http";
import { lookupRoom } from "@/lib/server/game-api";

/** GET /api/rooms/[code] → RoomLookup. Rate limited per IP and globally (PIN enumeration). */
export const GET = apiRoute(async (request: Request, ctx: RouteContext<"/api/rooms/[code]">) => {
  const { code } = await ctx.params;
  if (!roomCodeSchema.safeParse(code).success) return json({ status: "not_found" }, 404);
  return respond(lookupRoom(code, requestIp(request)));
});
