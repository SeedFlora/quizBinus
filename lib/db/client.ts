import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { serverEnv } from "@/lib/env.server";
import * as schema from "./schema";

/**
 * PostgreSQL connection (database mode). One pg Pool per process, kept on globalThis
 * so dev hot reloads do not leak connections. Returns null in memory mode
 * (DATABASE_URL unset); callers decide what "no database" means for them.
 */

export type Db = NodePgDatabase<typeof schema>;

interface Connection {
  url: string;
  pool: Pool;
  db: Db;
}

const globalForDb = globalThis as unknown as { __nqDb?: Connection };

/** Pool size: one app container serves a campus; Postgres defaults to 100 connections. */
const POOL_MAX = 10;

function connect(url: string): Connection {
  const pool = new Pool({
    connectionString: url,
    max: POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "nusaquest",
  });
  // An idle client losing its connection (Postgres restart) must not crash the process.
  pool.on("error", (err) => console.error("[db] idle client error", err.message));
  return { url, pool, db: drizzle(pool, { schema }) };
}

export function getDb(): Db | null {
  const url = serverEnv.databaseUrl;
  if (!url) return null;
  const current = globalForDb.__nqDb;
  if (current?.url === url) return current.db;
  if (current) void current.pool.end().catch(() => undefined);
  globalForDb.__nqDb = connect(url);
  return globalForDb.__nqDb.db;
}

/** The database or an error: for code paths that only run in database mode. */
export function requireDb(): Db {
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL is not configured");
  return db;
}

/** The underlying pool (migrations take an advisory lock on a dedicated client). */
export function getPool(): Pool | null {
  return getDb() ? globalForDb.__nqDb!.pool : null;
}

/** Health probe: true when a trivial query succeeds within the pool's connect timeout. */
export async function checkDb(): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;
  try {
    await pool.query("select 1");
    return true;
  } catch {
    return false;
  }
}

/** Closes the pool (tests, graceful shutdown). The next getDb() reconnects. */
export async function closeDb(): Promise<void> {
  const current = globalForDb.__nqDb;
  globalForDb.__nqDb = undefined;
  await current?.pool.end();
}
