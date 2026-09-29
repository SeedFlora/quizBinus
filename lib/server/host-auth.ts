import "server-only";
import { getLecturerOrNull } from "@/lib/auth/lecturer";
import { DEMO_SESSION_ID } from "@/lib/demo/simulate";
import { isDatabaseConfigured, serverEnv } from "@/lib/env.server";
import { constantTimeEqual } from "@/lib/security/sha256";
import { hashToken, randomToken } from "@/lib/security/token";
import type { SessionMeta } from "./game-runtime";

/**
 * Who may drive a live session.
 *
 *   Database mode  the signed-in lecturer whose id is the session's host_id
 *                  (auth cookie, lib/auth/session.ts).
 *   Memory mode    there are no accounts (everyone is the demo lecturer), so the
 *                  browser that created the session gets a random HOST KEY in an
 *                  HttpOnly cookie and only that browser may drive it. Students know
 *                  the session id (it is in their /play URL); they never get the key.
 *   The demo       the shared server demo ("demo"): anyone in memory mode, any
 *                  signed-in lecturer in database mode.
 */

export const HOST_KEY_COOKIE = "nq_host";
const HOST_KEY_MAX_AGE = 30 * 24 * 60 * 60;
const HOST_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface HostIdentity {
  /** Lecturer id (memory mode: the demo lecturer). */
  id: string;
  /** "Bu Laras Wicaksono": shown to players as the room's host. */
  displayName: string;
  mode: "memory" | "database";
  /** Memory mode: sha256 of this browser's host key cookie, if it has one. */
  hostKeyHash: string | null;
}

/** Reads one cookie from the Cookie header (route handlers stay testable without Next's request scope). */
export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** The caller as a potential host, or null (database mode, not signed in). */
export async function getHost(request: Request): Promise<HostIdentity | null> {
  const lecturer = await getLecturerOrNull();
  if (!lecturer) return null;
  const displayName = `${lecturer.salutation} ${lecturer.fullName}`.trim();
  if (isDatabaseConfigured()) return { id: lecturer.id, displayName, mode: "database", hostKeyHash: null };
  const key = readCookie(request, HOST_KEY_COOKIE);
  return {
    id: lecturer.id,
    displayName,
    mode: "memory",
    hostKeyHash: key && HOST_KEY_PATTERN.test(key) ? hashToken(key) : null,
  };
}

export function canHost(sessionId: string, meta: SessionMeta, host: HostIdentity | null): boolean {
  if (sessionId === DEMO_SESSION_ID) return isDatabaseConfigured() ? host !== null : true;
  if (!host || meta.hostId !== host.id) return false;
  if (host.mode === "database") return true;
  // Memory-mode sessions always carry a key hash; one without (restored or legacy) is open.
  if (!meta.hostKeyHash) return true;
  return host.hostKeyHash !== null && constantTimeEqual(meta.hostKeyHash, host.hostKeyHash);
}

function isSecure(request: Request): boolean {
  if (serverEnv.cookieSecure !== "auto") return serverEnv.cookieSecure === "true";
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return proto ? proto === "https" : new URL(request.url).protocol === "https:";
}

/**
 * Memory mode: the host key hash for a new session, reusing this browser's key when
 * it has one. `setCookie` is the header to send when a key was just minted.
 */
export function issueHostKey(request: Request, host: HostIdentity): { hash: string; setCookie: string | null } {
  if (host.hostKeyHash) return { hash: host.hostKeyHash, setCookie: null };
  const key = randomToken();
  const attributes = [
    `${HOST_KEY_COOKIE}=${key}`,
    "Path=/api",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${HOST_KEY_MAX_AGE}`,
    ...(isSecure(request) ? ["Secure"] : []),
  ];
  return { hash: hashToken(key), setCookie: attributes.join("; ") };
}
