import "server-only";
import { z } from "zod";

/**
 * Server-only environment. Never throws at import: with no variables at all the app
 * runs in MEMORY mode (game server in this process, quizzes in the lecturer's
 * browser, demo lecturer, nothing persisted), so a fresh clone works with
 * `npm run dev` and nothing else. Each variable is validated on its own, so one
 * malformed value is logged and ignored instead of silently disabling the database.
 *
 *   DATABASE_URL            postgres://user:pass@host:5432/db  → DATABASE mode
 *   ADMIN_EMAIL             first admin, created on boot when the users table is empty
 *   ADMIN_PASSWORD          its initial password (change it after the first sign-in)
 *   ADMIN_NAME              its display name (default "Administrator")
 *   UPLOAD_DIR              where uploaded images are stored (default ./data/uploads)
 *   APP_URL                 canonical public origin, e.g. https://quiz.binus.ac.id
 *                           (falls back to NEXT_PUBLIC_APP_URL)
 *   SESSION_COOKIE_SECURE   auto (default: Secure when the request came in over https),
 *                           true, or false
 *   TRUST_PROXY             1 when a reverse proxy in front of the app sets
 *                           X-Forwarded-For; only then is its first hop used as the
 *                           client address for rate limiting (lib/security/client-ip.ts)
 */

const optionalUrl = z.url({ protocol: /^https?$/ }).or(z.literal(""));
const postgresUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\/\S+$/, "must be a postgres:// URL")
  .or(z.literal(""));

function read<S extends z.ZodType>(name: string, schema: S, fallback: z.output<S>): z.output<S> {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = schema.safeParse(raw.trim());
  if (parsed.success) return parsed.data;
  // Log the variable name only: values may be secrets.
  console.error(`[env] ${name} is invalid and was ignored: ${parsed.error.issues[0]?.message ?? "invalid"}`);
  return fallback;
}

const cookieSecure = read("SESSION_COOKIE_SECURE", z.enum(["auto", "true", "false"]), "auto");

export const serverEnv: {
  databaseUrl: string;
  adminEmail: string;
  adminPassword: string;
  adminName: string;
  uploadDir: string;
  appUrl: string;
  cookieSecure: "auto" | "true" | "false";
  trustProxy: boolean;
} = {
  databaseUrl: read("DATABASE_URL", postgresUrl, ""),
  adminEmail: read(
    "ADMIN_EMAIL",
    z.email().transform((v) => v.toLowerCase()),
    "",
  ),
  // Like every variable, surrounding whitespace is trimmed.
  adminPassword: read("ADMIN_PASSWORD", z.string().min(1), ""),
  adminName: read("ADMIN_NAME", z.string().max(120), "Administrator"),
  uploadDir: read("UPLOAD_DIR", z.string().max(500), "./data/uploads"),
  appUrl: (read("APP_URL", optionalUrl, "") || read("NEXT_PUBLIC_APP_URL", optionalUrl, "")).replace(/\/+$/, ""),
  cookieSecure,
  trustProxy: read("TRUST_PROXY", z.enum(["1", "true", "0", "false"]), "0").match(/^(1|true)$/) !== null,
};

/** True when DATABASE_URL is set: lecturer accounts, stored quizzes, persisted sessions. */
export function isDatabaseConfigured(): boolean {
  return serverEnv.databaseUrl !== "";
}
