/**
 * Best-effort client address for rate limiting.
 *
 * Next.js route handlers never see the socket. The Node server copies the socket
 * address into `x-forwarded-for` only when the request did not carry that header
 * already, so what the header means depends on the deployment:
 *
 *   TRUST_PROXY=1  a reverse proxy (nginx, Caddy, Traefik) in front of the app sets
 *                  X-Forwarded-For / X-Real-IP; the FIRST hop is the client. Configure
 *                  the proxy to overwrite (not append to) the header, see docs/DEPLOYMENT.md.
 *   otherwise      the app is reached directly (LAN / `npm run dev`); the LAST hop is
 *                  the socket address Next.js filled in, with X-Real-IP as a fallback.
 *
 * A client talking to the app directly can still pre-fill these headers, so this is a
 * bucket key, not an identity: the per-IP limits are backed by global and per-player
 * limits (lib/security/rate-limit.ts).
 */

const MAX_LENGTH = 64;

function clean(value: string | undefined): string {
  const v = (value ?? "").trim().replace(/^\[|\]$/g, "");
  // IPv4-mapped IPv6 (::ffff:10.0.0.7) and plain IPv4 share one bucket.
  return v.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, "").slice(0, MAX_LENGTH);
}

export function clientIp(headers: Headers, trustProxy = false): string {
  const hops = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  const realIp = headers.get("x-real-ip") ?? undefined;
  const chosen = trustProxy ? (hops[0] ?? realIp) : (hops.at(-1) ?? realIp);
  return clean(chosen) || "unknown";
}
