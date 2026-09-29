import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Content Security Policy, in two layers:
 *
 *   enforced     directives that cannot break a page: no framing by other sites
 *                (clickjacking; X-Frame-Options for older browsers), no <base> or form
 *                hijacking, no plugins.
 *   report-only  the full "without nonces" policy from the Next.js CSP guide. Browsers
 *                log violations to the console without blocking, so it can be checked
 *                on a production build before it is enforced (move it into the first
 *                header). Script nonces ('strict-dynamic') would need every page
 *                rendered dynamically through proxy.ts, a larger change.
 *
 * Never add `upgrade-insecure-requests`: LAN installs serve phones over plain http.
 * Question images may be external http(s) URLs (lib/quiz/schema.ts); QR codes and
 * inline uploads are data: URLs. Dev needs eval (React debugging) and the HMR socket.
 */
const baseCsp = ["frame-ancestors 'self'", "base-uri 'self'", "form-action 'self'", "object-src 'none'"];
const fullCsp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: http:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "media-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "frame-src 'self'",
  "manifest-src 'self'",
  ...baseCsp,
];

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: baseCsp.join("; ") },
  { key: "Content-Security-Policy-Report-Only", value: fullCsp.join("; ") },
  // No Cross-Origin-Opener-Policy: classrooms often run on plain-HTTP LAN addresses,
  // where browsers ignore COOP and log a console error on every page. The app opens
  // no cross-origin popups, so COOP would add nothing here.
  // Camera is used only for in-app QR scanning on /join.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Self-contained server bundle for Docker (see Dockerfile).
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // The Next dev indicator overlaps the player controller's bottom-left corner.
  devIndicators: { position: "top-right" },
  // Dev only: lets phones on the classroom LAN open the dev server via the laptop's IP
  // (Next blocks cross-origin dev assets by default). No effect on production builds.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
  experimental: {
    optimizePackageImports: ["lucide-react", "motion"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
