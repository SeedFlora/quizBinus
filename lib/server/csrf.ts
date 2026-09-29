import "server-only";
import { serverEnv } from "@/lib/env.server";
import { ApiError } from "./http";

/**
 * Cross-site request forgery guard for state-changing routes that authenticate with
 * a cookie (lecturer session, memory-mode host key). A browser always tells us where
 * a request came from:
 *
 *   Sec-Fetch-Site  set by every current browser and not forgeable from script:
 *                   "same-origin" / "none" pass, anything else is rejected.
 *   Origin          older browsers: must match the Host the request was sent to
 *                   (or X-Forwarded-Host behind a proxy, or APP_URL).
 *
 * Requests with neither header do not come from a browser page (curl, scripts,
 * health checks) and cannot carry a victim's cookies by accident, so they pass.
 */

function hostOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

export function isSameOriginRequest(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";

  const origin = request.headers.get("origin");
  if (!origin) return true;
  const originHost = hostOf(origin);
  if (!originHost) return false; // "null" (sandboxed iframes, file://) is never same-origin

  const allowed = new Set<string>();
  const host = request.headers.get("host");
  if (host) allowed.add(host.toLowerCase());
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (forwarded) allowed.add(forwarded.toLowerCase());
  const appHost = hostOf(serverEnv.appUrl);
  if (appHost) allowed.add(appHost);
  return allowed.has(originHost);
}

/** Throws 403 { error: "cross_origin" } for a cross-site browser request. */
export function assertSameOrigin(request: Request) {
  if (!isSameOriginRequest(request)) throw new ApiError("cross_origin", 403);
}
