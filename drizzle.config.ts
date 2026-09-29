import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit: `npx drizzle-kit generate` turns changes in lib/db/schema.ts into a new
 * SQL migration in drizzle/ (commit it). The app applies pending migrations itself on
 * boot (lib/db/migrate.ts), so `drizzle-kit migrate` is only needed for manual ops.
 * See docs/DATABASE.md.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
