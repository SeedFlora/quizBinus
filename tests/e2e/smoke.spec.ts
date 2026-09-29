/**
 * Smoke: public, creator and tooling pages render without runtime or console errors.
 * In database mode the creator pages redirect to /login (no session cookie), which
 * must itself render cleanly, so the list holds in both modes.
 */

import { expect, test } from "@playwright/test";
import { API_TIMEOUT, health, trackErrors } from "./helpers";

const PAGES = [
  "/",
  "/join",
  "/dashboard",
  "/quizzes",
  "/sessions",
  "/settings",
  "/login",
  "/design",
  "/preview",
  "/lab/audio",
];

for (const path of PAGES) {
  test(`${path} renders cleanly`, async ({ page }) => {
    // A cold `next dev --webpack` compile of a creator route can take minutes on slow disks.
    test.slow();
    const errors = trackErrors(page);
    const response = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 240_000 });
    expect(response?.status(), `HTTP status for ${path}`).toBeLessThan(400);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await expect(page.locator("h1, h2").first()).toBeVisible();
    // No horizontal scroll at this width.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
    // Give client effects a beat to surface late errors.
    await page.waitForTimeout(500);
    expect(errors, errors.join("\n")).toEqual([]);
  });
}

test("GET /api/health reports the self-hosted runtime", async ({ request }) => {
  const res = await request.get("/api/health", { timeout: API_TIMEOUT });
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"] ?? "").toMatch(/no-store/);
  const body = await health(request);
  expect(body).toMatchObject({
    ok: true,
    mode: expect.stringMatching(/^(memory|database)$/),
    db: expect.stringMatching(/^(up|down|off)$/),
  });
  expect(typeof body.sessions).toBe("number");
  expect(typeof body.subscribers).toBe("number");
  if (body.mode === "memory") expect(body.db).toBe("off");
});

test("GET /api/network lists phone-reachable http origins", async ({ request }) => {
  const res = await request.get("/api/network", { timeout: API_TIMEOUT });
  expect(res.status()).toBe(200);
  const { origins } = (await res.json()) as { origins: unknown };
  expect(Array.isArray(origins)).toBe(true);
  for (const origin of origins as unknown[]) expect(origin).toMatch(/^https?:\/\/[^/]+$/);
});

test("state-changing routes refuse cross-origin requests (CSRF)", async ({ request }) => {
  const res = await request.post("/api/demo/host", {
    headers: { origin: "http://evil.example", "content-type": "application/json" },
    data: {},
    failOnStatusCode: false,
    timeout: API_TIMEOUT,
  });
  expect(res.status()).toBe(403);
});
