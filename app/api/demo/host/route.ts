import { apiRoute, json, requestIp, respond } from "@/lib/server/http";
import { assertSameOrigin } from "@/lib/server/csrf";
import { ensureDemoSession } from "@/lib/server/game-api";
import { isDatabaseConfigured } from "@/lib/env.server";
import { getLecturerOrNull } from "@/lib/auth/lecturer";

/**
 * POST /api/demo/host → { sessionId: "demo", roomCode: "482913" }. Starts (or reuses)
 * the shared server demo with 41 simulated students so phones on the network can
 * join the projector's demo. It is never persisted.
 *
 * Memory mode: open to anyone (trusted-LAN setups). Database mode: only a signed-in
 * lecturer may start it, the same rule that lets them drive it. Otherwise a visitor
 * could start a demo no one can drive, and phones would wait in it forever.
 */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  if (isDatabaseConfigured() && !(await getLecturerOrNull())) return json({ error: "unauthorized" }, 401);
  return respond(await ensureDemoSession(requestIp(request)));
});
