import { apiRoute, json } from "@/lib/server/http";
import { phoneOrigins } from "@/lib/server/network";

/**
 * GET /api/network → { origins: string[] }: addresses phones on the same network can
 * open (APP_URL first, then this machine's LAN IPs with the request's port). The host
 * lobby uses it when the projector itself is on http://localhost.
 */
export const GET = apiRoute(async (request: Request) => json({ origins: phoneOrigins(request) }));
