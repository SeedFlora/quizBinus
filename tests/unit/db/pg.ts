import { Client } from "pg";

/**
 * Throwaway databases for the Postgres integration tests.
 *
 *   docker start nq-test-pg || docker run -d --name nq-test-pg -e POSTGRES_USER=nq \
 *     -e POSTGRES_PASSWORD=nq -e POSTGRES_DB=nusaquest_test -p 55432:5432 postgres:17-alpine
 *   TEST_DATABASE_URL=postgres://nq:nq@localhost:55432/nusaquest_test npx vitest run tests/unit/db
 *
 * Each test file creates its own database (so migrations always start from empty and
 * files never collide) and drops it afterwards. Without TEST_DATABASE_URL the
 * integration suites are skipped and `npm test` stays hermetic.
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim() || undefined;

async function admin<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

export async function createTestDatabase(label: string): Promise<{ url: string; drop: () => Promise<void> }> {
  if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is not set");
  const name = `nq_it_${label}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await admin((c) => c.query(`create database "${name}"`));
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    drop: () => admin((c) => c.query(`drop database if exists "${name}" with (force)`)).then(() => undefined),
  };
}
