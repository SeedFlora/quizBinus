import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end suite for the self-hosted game server (fetch commands + SSE). The key
 * specs use separate browser contexts as separate devices (projector + phones), so
 * nothing is shared between them except the Next.js server.
 *
 * Target server:
 *   - E2E_BASE_URL set    → run against that server, never start one
 *                           (e.g. E2E_BASE_URL=http://localhost:3000 for `docker compose up`).
 *   - E2E_BASE_URL unset  → http://localhost:3100. If something already answers there
 *                           (the usual `next dev -p 3100`), it is reused; only when nothing
 *                           listens does Playwright start `next dev -p 3100` itself.
 *                           Next 16 allows one `next dev` per project directory
 *                           (.next/dev lock), so reuse is the normal case while developing.
 *
 * Database mode: lecturer screens need a login. Set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 * (the ADMIN_* bootstrap account) or those specs skip themselves. creator-flow.spec.ts
 * covers memory mode (quizzes in the browser) only.
 *
 * Run:  npx playwright test            (all projects)
 *       npx playwright test --project=chromium tests/e2e/server-demo.spec.ts
 */
const externalBaseURL = process.env.E2E_BASE_URL;
const baseURL = externalBaseURL ?? "http://localhost:3100";

/** Specs a phone can run on its own (no projector): also run on the Pixel 7 project. */
const PLAYER_ONLY = /player-.*\.spec\.ts/;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  // The demo session id and PIN are shared server state, and join/lookup rate limits are
  // per IP (every context here is 127.0.0.1): specs must not overlap.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    // `next dev` compiles routes on first hit; generous so a cold route is not a failure.
    navigationTimeout: 90_000,
  },
  projects: [
    // Projector / lecturer desk (and the phones those specs open as extra Pixel 7 contexts).
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // A student's phone on its own.
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: PLAYER_ONLY },
  ],
  webServer: externalBaseURL
    ? undefined
    : {
        command: "npx next dev -p 3100",
        url: `${baseURL}/api/health`,
        reuseExistingServer: true,
        timeout: 180_000,
        stdout: "ignore",
        stderr: "pipe",
      },
});
