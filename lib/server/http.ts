import "server-only";
import type { z } from "zod";
import { loggableError } from "@/lib/db/errors";
import { serverEnv } from "@/lib/env.server";
import { clientIp } from "@/lib/security/client-ip";
import { MAX_BODY_BYTES } from "@/lib/validation/api";
import { ensureServerReady } from "./bootstrap";

/**
 * Plumbing shared by the route handlers in app/api: JSON responses that are never
 * cached, bounded body reading, zod parsing, one error shape ({ error: code }) and
 * the boot gate (migrations, admin bootstrap, session restore) every route awaits.
 */

/** An expected failure with a stable machine-readable code. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    /** Extra fields merged into the error body (e.g. a domain union's discriminator). */
    readonly extra?: Record<string, unknown>,
  ) {
    super(code);
  }
}

/** What lib/server handlers return; routes turn it into a Response. */
export interface ApiResult<T> {
  status: number;
  body: T;
  headers?: Record<string, string>;
}

export const result = <T>(body: T, status = 200, headers?: Record<string, string>): ApiResult<T> => ({
  status,
  body,
  headers,
});

export function json(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export function respond<T>(res: ApiResult<T>): Response {
  return json(res.body, res.status, { ...(res.status === 429 ? { "Retry-After": "10" } : {}), ...res.headers });
}

/** Reads at most `maxBytes` of the body; bigger (or lying Content-Length) bodies get 413. */
export async function readBodyBytes(request: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new ApiError("payload_too_large", 413);
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ApiError("payload_too_large", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readJson<S extends z.ZodType>(
  request: Request,
  schema: S,
  maxBytes = MAX_BODY_BYTES,
): Promise<z.output<S>> {
  const text = new TextDecoder().decode(await readBodyBytes(request, maxBytes));
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ApiError("invalid_json", 400);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid_body", 400);
  return parsed.data;
}

export function parseParam<S extends z.ZodType>(value: unknown, schema: S, notFound = "not_found"): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError(notFound, 404);
  return parsed.data;
}

/** The rate-limit bucket for this request (see lib/security/client-ip.ts for TRUST_PROXY). */
export function requestIp(request: Request): string {
  return clientIp(request.headers, serverEnv.trustProxy);
}

/**
 * Wraps a route handler: waits for the server to be ready (first request after a
 * boot), maps ApiError → { error }, and turns anything else into a logged 500
 * without leaking internals.
 */
export function apiRoute<C>(handler: (request: Request, context: C) => Promise<Response>) {
  return async (request: Request, context: C): Promise<Response> => {
    try {
      await ensureServerReady();
      return await handler(request, context);
    } catch (err) {
      if (err instanceof ApiError) {
        return json(
          { ...err.extra, error: err.code },
          err.status,
          err.status === 429 ? { "Retry-After": "10" } : undefined,
        );
      }
      console.error(`[api] ${request.method} ${new URL(request.url).pathname}`, loggableError(err));
      return json({ error: "internal" }, 500);
    }
  };
}
