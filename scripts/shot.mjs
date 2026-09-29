#!/usr/bin/env node
/**
 * Screenshot helper for visual review and for the README image set (docs/screenshots/).
 *
 *   node scripts/shot.mjs <url-or-path> <out.png|out.jpg> [widthxheight] [flags]
 *
 * Flags
 *   --wait=ms          extra settle time after network idle (default 1200)
 *   --full             capture the full scrollable page
 *   --reduced-motion   emulate prefers-reduced-motion: reduce
 *   --quality=n        JPEG quality 0-100 (only when the output ends in .jpg/.jpeg; default 82)
 *   --hide-dev         hide the Next.js dev indicator/overlay (clean docs screenshots)
 *   --host=name        serve BASE_URL under http://<name> (Chromium host mapping), so screens that
 *                      print the join URL show e.g. "nusaquest.local/join" instead of "localhost:3100"
 *
 * Examples
 *   node scripts/shot.mjs /dashboard .shots/dashboard.png 1440x900
 *   node scripts/shot.mjs /join .shots/join.png 390x844 --wait=1500
 *   node scripts/shot.mjs /preview/host-reveal docs/screenshots/host-reveal.jpg 1920x1080 --quality=82 --hide-dev
 *   node scripts/shot.mjs /preview/host-lobby docs/screenshots/host-lobby.jpg 1920x1080 --hide-dev --host=nusaquest.local
 *
 * Uses BASE_URL (default http://localhost:3100) for relative paths.
 */
import { chromium } from "@playwright/test";

const [, , target, out, size = "1440x900", ...flags] = process.argv;
if (!target || !out) {
  console.error(
    "usage: node scripts/shot.mjs <url-or-path> <out.png|out.jpg> [WxH] [--wait=ms] [--full] [--reduced-motion] [--quality=n] [--hide-dev] [--host=name]",
  );
  process.exit(1);
}
const flag = (name) => flags.find((f) => f.startsWith(`--${name}=`))?.split("=")[1];
const [width, height] = size.split("x").map(Number);
const wait = Number(flag("wait") ?? 1200);
const full = flags.includes("--full");
const reduced = flags.includes("--reduced-motion");
const hideDev = flags.includes("--hide-dev");
const isJpeg = /\.jpe?g$/i.test(out);
const quality = isJpeg ? Math.min(100, Math.max(0, Number(flag("quality") ?? 82))) : undefined;
const alias = flag("host");
const origin = new URL(process.env.BASE_URL ?? "http://localhost:3100");
const base = alias ? `http://${alias}` : origin.origin;
const url = /^https?:/.test(target) ? target : `${base}${target}`;
// The dev server only accepts cross-origin dev assets from allowedDevOrigins (next.config.ts), e.g. *.local.
const hostRules = alias
  ? [
      `--host-resolver-rules=MAP ${alias}:80 ${origin.hostname === "localhost" ? "127.0.0.1" : origin.hostname}:${origin.port || 80}`,
    ]
  : [];

/** Bundled Chromium first; fall back to an installed Chrome/Edge so reviews work before `playwright install`. */
async function launch() {
  for (const opts of [{}, { channel: "chrome" }, { channel: "msedge" }]) {
    try {
      return await chromium.launch({ ...opts, args: hostRules });
    } catch {
      /* try the next option */
    }
  }
  throw new Error("No Chromium available. Run: npx playwright install chromium");
}

const browser = await launch();
try {
  const page = await browser.newPage({
    viewport: { width, height },
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
  await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  if (hideDev) {
    // The dev indicator and error overlay live in <nextjs-portal> (shadow DOM); hiding the host hides both.
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  }
  await page.waitForTimeout(wait);
  await page.screenshot({
    path: out,
    fullPage: full,
    ...(isJpeg ? { type: "jpeg", quality } : {}),
  });
  console.log(`saved ${out} (${width}x${height}${isJpeg ? `, q${quality}` : ""}) ← ${url}`);
  if (errors.length) console.log(`page errors:\n${errors.join("\n")}`);
} finally {
  await browser.close();
}
