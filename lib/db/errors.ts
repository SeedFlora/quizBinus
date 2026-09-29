/**
 * Postgres error helpers. Drizzle wraps driver errors (DrizzleQueryError) and keeps
 * the pg error as `cause`, so the SQLSTATE can sit one or two levels down.
 */

export function pgErrorCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** 23505: a unique constraint (email, room code, …) already holds this value. */
export function isUniqueViolation(err: unknown): boolean {
  return pgErrorCode(err) === "23505";
}

/** Drizzle's DrizzleQueryError: its message ends with "params: …", the bound values. */
function isQueryError(err: unknown): err is Error & { query: string } {
  return err instanceof Error && typeof (err as { query?: unknown }).query === "string" && "params" in err;
}

/**
 * A one-line description that is safe to log. A failed query's bound values can be a
 * password hash (createUser, setUserPassword), an email or a whole quiz, so only the
 * SQL and the driver's own message are kept.
 */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const message = isQueryError(err) ? `Failed query: ${err.query}` : err.message;
  const cause = err.cause instanceof Error ? ` (${err.cause.message})` : "";
  return `${message}${cause}`;
}

/** What to hand to console.error: the error itself (with its stack), or a redacted line for a failed query. */
export function loggableError(err: unknown): unknown {
  return isQueryError(err) ? describeError(err) : err;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Guards uuid columns: comparing a uuid column with a non-uuid string is a Postgres error. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
