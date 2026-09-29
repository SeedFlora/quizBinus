import "server-only";
import pkg from "@/package.json";
import { checkDb } from "@/lib/db/client";
import { isDatabaseConfigured } from "@/lib/env.server";
import { getGameRuntime } from "./game-runtime";

export interface Health {
  ok: boolean;
  mode: "memory" | "database";
  db: "up" | "down" | "off";
  sessions: number;
  subscribers: number;
  version: string;
}

/** A health probe must answer quickly even when Postgres hangs. */
const DB_PROBE_MS = 2000;

/**
 * GET /api/health for Docker HEALTHCHECK, compose, reverse proxies and uptime monitors.
 * `ok` is false (HTTP 503) only when database mode cannot reach Postgres: the game
 * server itself is in-process and always up while this code runs.
 */
export async function health(): Promise<Health> {
  const database = isDatabaseConfigured();
  let db: Health["db"] = "off";
  if (database) {
    const probe = await Promise.race([
      checkDb(),
      new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), DB_PROBE_MS);
        timer.unref?.();
      }),
    ]);
    db = probe ? "up" : "down";
  }
  const { sessions, subscribers } = getGameRuntime().stats();
  return {
    ok: db !== "down",
    mode: database ? "database" : "memory",
    db,
    sessions,
    subscribers,
    // APP_VERSION (e.g. a git SHA set by CI) overrides the package.json version.
    version: process.env.APP_VERSION || pkg.version,
  };
}
