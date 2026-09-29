#!/usr/bin/env node
/**
 * Renders the product mark (app/icon.svg) into the raster icons the PWA manifest
 * and iOS need. Re-run after changing the mark:
 *
 *   node scripts/generate-icons.mjs
 *
 * Outputs
 *   public/icons/icon-192.png          purpose "any": transparent, mark near full bleed
 *   public/icons/icon-512.png          purpose "maskable": navy stage, mark inside the 80% safe circle
 *   public/icons/apple-touch-icon.png  180×180 navy (iOS fills transparency with black and rounds corners itself)
 *   app/apple-icon.png                 same image; Next.js emits <link rel="apple-touch-icon"> for it
 *
 * Uses Playwright's bundled Chromium, falling back to an installed Chrome/Edge.
 */
import { chromium } from "@playwright/test";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const STAGE = "#061433"; // --binus-blue-950, the stage (matches brand.themeColor)

/** size: canvas px; mark: mark px; bg: CSS background or "transparent". */
const TARGETS = [
  { out: "public/icons/icon-192.png", size: 192, mark: 176, bg: "transparent" },
  // Maskable: a square mark of side s stays inside the r = 40% safe circle while s·√2/2 ≤ 0.4·512.
  { out: "public/icons/icon-512.png", size: 512, mark: 284, bg: STAGE },
  { out: "public/icons/apple-touch-icon.png", size: 180, mark: 116, bg: STAGE },
];

async function launch() {
  for (const opts of [{}, { channel: "chrome" }, { channel: "msedge" }]) {
    try {
      return await chromium.launch(opts);
    } catch {
      /* try the next option */
    }
  }
  throw new Error("No Chromium available. Run: npx playwright install chromium");
}

const svg = (await readFile(join(root, "app/icon.svg"), "utf8")).trim();
if (!svg.startsWith("<svg")) throw new Error("app/icon.svg does not look like an SVG");

const browser = await launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const t of TARGETS) {
    const sized = svg.replace("<svg", `<svg width="${t.mark}" height="${t.mark}"`);
    await page.setViewportSize({ width: t.size, height: t.size });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:${t.bg}">` +
        `<div id="icon" style="width:${t.size}px;height:${t.size}px;display:grid;place-items:center">${sized}</div>` +
        `</body></html>`,
    );
    const file = join(root, t.out);
    await mkdir(dirname(file), { recursive: true });
    await page.locator("#icon").screenshot({ path: file, omitBackground: t.bg === "transparent" });
    console.log(`wrote ${t.out} (${t.size}×${t.size})`);
  }
  await copyFile(join(root, "public/icons/apple-touch-icon.png"), join(root, "app/apple-icon.png"));
  console.log("wrote app/apple-icon.png (copy of apple-touch-icon)");
} finally {
  await browser.close();
}
