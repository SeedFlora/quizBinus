import { connection } from "next/server";
import { apiRoute, json } from "@/lib/server/http";
import { health } from "@/lib/server/health";

/**
 * GET /api/health → { ok, mode: "memory" | "database", db: "up" | "down" | "off",
 * sessions, subscribers, version }. 503 when database mode cannot reach Postgres.
 */
export const GET = apiRoute(async () => {
  // Always evaluate at request time; a prerendered health check would prove nothing.
  await connection();
  const body = await health();
  return json(body, body.ok ? 200 : 503);
});
