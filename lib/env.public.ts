import { z } from "zod";

/**
 * Public (browser-exposed) environment. NEXT_PUBLIC_* values are inlined at build
 * time, so each is referenced literally for Next.js to replace.
 *
 *   NEXT_PUBLIC_APP_URL         canonical public origin (join links, QR codes)
 *   NEXT_PUBLIC_REALTIME_MODE   "server" (default): the game server in the Next.js
 *                               process, multi-device over HTTP + SSE.
 *                               "local": everything in one browser (BroadcastChannel),
 *                               for offline kiosks and the Playwright suite.
 *   NEXT_PUBLIC_BINUS_LOGO_SRC  optional official logo path (see lib/brand.ts)
 */
const schema = z.object({
  NEXT_PUBLIC_APP_URL: z
    .url({ protocol: /^https?$/ })
    .optional()
    .or(z.literal("")),
  // "auto" is the pre-self-hosting default; it now means the server transport.
  NEXT_PUBLIC_REALTIME_MODE: z
    .enum(["server", "local", "auto"])
    .default("server")
    .transform((mode) => (mode === "local" ? ("local" as const) : ("server" as const))),
  NEXT_PUBLIC_BINUS_LOGO_SRC: z.string().optional(),
});

const parsed = schema.safeParse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_REALTIME_MODE: process.env.NEXT_PUBLIC_REALTIME_MODE || undefined,
  NEXT_PUBLIC_BINUS_LOGO_SRC: process.env.NEXT_PUBLIC_BINUS_LOGO_SRC,
});

if (!parsed.success) {
  // Fail loudly in development; never ship a half-configured build silently.
  console.error("Invalid public environment:", z.prettifyError(parsed.error));
}

const env = parsed.success ? parsed.data : schema.parse({});

export const publicEnv: {
  appUrl: string;
  realtimeMode: "server" | "local";
  binusLogoSrc: string;
} = {
  appUrl: (env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, ""),
  realtimeMode: env.NEXT_PUBLIC_REALTIME_MODE,
  binusLogoSrc: env.NEXT_PUBLIC_BINUS_LOGO_SRC || "",
};
