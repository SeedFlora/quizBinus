import {
  devices,
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import id from "../../locales/id.json";
import { OS_BATTLE } from "../../lib/seed/quizzes";

/** Indonesian UI copy, straight from the source-of-truth dictionary. */
export const ID = id;

export const DEMO_PIN = "482913";
export const DEMO_SESSION = "demo";

/** A PIN the generator can never produce (all one digit), so no live room owns it. */
export const UNUSED_PIN = "111111";

/** Regex-escapes UI text (answer options contain dots, parentheses, …). */
export const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** First hits compile routes in `next dev`; API helpers wait longer than UI actions. */
export const API_TIMEOUT = 60_000;

/** Page transitions that may wait on an on-demand compile in `next dev`. */
export const NAV_TIMEOUT = 60_000;

/** Short per-run suffix so reruns against a long-lived dev server never collide on nicknames. */
export const runTag = () => Math.random().toString(36).slice(2, 6).toUpperCase();

/* ------------------------------------------------------------------ */
/* Errors                                                               */
/* ------------------------------------------------------------------ */

/**
 * Collects console errors and uncaught exceptions for a page. `allow` lists
 * patterns that a spec expects on purpose (e.g. the browser logging a 404 for an
 * unknown PIN, which is the API answering correctly).
 */
export function trackErrors(page: Page, allow: RegExp[] = []) {
  const errors: string[] = [];
  const allowed = (text: string) => allow.some((re) => re.test(text));
  page.on("pageerror", (err) => {
    const text = `pageerror: ${err.message}`;
    if (!allowed(text)) errors.push(text);
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = `console.error: ${msg.text()} @ ${msg.location().url}`;
    if (!allowed(text)) errors.push(text);
  });
  return errors;
}

/**
 * Chrome logs every non-2xx fetch as "Failed to load resource". Some game API answers
 * are expected: 404 for an unknown PIN (and for the demo PIN when no server demo runs,
 * which is how the phone decides to fall back to the solo demo), 401/404/410 for an
 * ended session's stream, 409 for a harmless repeated host command (the projector's
 * intro/deadline timers racing a click) or a nickname already taken.
 */
export const EXPECTED_API_STATUS =
  /Failed to load resource: the server responded with a status of (401|404|409|410) .*\/api\/(sessions|rooms)\//;

/* ------------------------------------------------------------------ */
/* Server API                                                           */
/* ------------------------------------------------------------------ */

export interface Health {
  ok: boolean;
  mode: "memory" | "database" | string;
  db?: "up" | "down" | "off";
  sessions?: number;
  subscribers?: number;
  version?: string;
}

export async function health(request: APIRequestContext): Promise<Health> {
  const res = await request.get("/api/health", { failOnStatusCode: false, timeout: API_TIMEOUT });
  return (await res.json().catch(() => ({ ok: false, mode: "unknown" }))) as Health;
}

/** State-changing routes reject cross-origin calls; a same-origin Origin header passes the check. */
export function sameOrigin(testInfo: TestInfo = test.info()) {
  const base = testInfo.project.use.baseURL ?? "http://localhost:3100";
  return { origin: new URL(base).origin, "content-type": "application/json" };
}

export async function lookupRoom(
  request: APIRequestContext,
  pin: string,
): Promise<{ status: string; sessionId?: string }> {
  const res = await request.get(`/api/rooms/${pin}`, { failOnStatusCode: false, timeout: API_TIMEOUT });
  return (await res.json().catch(() => ({ status: `http_${res.status()}` }))) as { status: string; sessionId?: string };
}

export async function hostCommand(request: APIRequestContext, sessionId: string, command: string, playerId?: string) {
  const res = await request.post(`/api/sessions/${encodeURIComponent(sessionId)}/host`, {
    headers: sameOrigin(),
    data: { command, playerId },
    failOnStatusCode: false,
    timeout: API_TIMEOUT,
  });
  return {
    status: res.status(),
    body: (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null,
  };
}

/**
 * Ends the shared SERVER demo (if one is live), so the demo PIN falls back to the
 * offline solo demo. In memory mode any caller may host the demo; in database mode
 * `request` must belong to a signed-in lecturer.
 */
export async function endServerDemo(request: APIRequestContext) {
  const result = await hostCommand(request, DEMO_SESSION, "end");
  const lookup = await lookupRoom(request, DEMO_PIN);
  return { result, lookup };
}

/** Skips the calling test unless the server runs the self-hosted game server. */
export async function requireServerMode(
  request: APIRequestContext,
  allowed: Health["mode"][] = ["memory", "database"],
) {
  const h = await health(request);
  test.skip(
    !allowed.includes(h.mode),
    `needs the self-hosted game server in ${allowed.join("/")} mode (GET /api/health → mode "${h.mode}")`,
  );
  return h;
}

/**
 * Database mode: lecturer screens need a session cookie. Signs in through the real
 * login form with E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD, or skips when they are unset.
 */
export async function signInIfNeeded(page: Page, mode: Health["mode"]) {
  if (mode !== "database") return;
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  test.skip(!email || !password, "database mode: set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to sign in");
  await page.goto("/login?next=/dashboard");
  await page.locator('input[type="email"]').fill(email!);
  await page.locator('input[type="password"]').fill(password!);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: NAV_TIMEOUT });
}

/* ------------------------------------------------------------------ */
/* Devices                                                              */
/* ------------------------------------------------------------------ */

/**
 * A separate phone: its own browser context (own cookies, localStorage, network),
 * emulating a Pixel 7, exactly like a student's device on the classroom Wi-Fi.
 */
export async function openPhone(
  browser: Browser,
  testInfo: TestInfo = test.info(),
): Promise<{ context: BrowserContext; page: Page }> {
  const pixel = devices["Pixel 7"];
  const context = await browser.newContext({
    userAgent: pixel.userAgent,
    viewport: pixel.viewport,
    deviceScaleFactor: pixel.deviceScaleFactor,
    isMobile: pixel.isMobile,
    hasTouch: pixel.hasTouch,
    baseURL: testInfo.project.use.baseURL,
    locale: testInfo.project.use.locale ?? "id-ID",
    timezoneId: testInfo.project.use.timezoneId ?? "Asia/Jakarta",
  });
  const page = await context.newPage();
  return { context, page };
}

/* ------------------------------------------------------------------ */
/* Wire recording                                                       */
/* ------------------------------------------------------------------ */

/**
 * Records every /api response body a page receives, including the SSE stream read
 * incrementally (a tee of the real response), so a spec can prove what actually
 * reached a student's phone.
 */
export async function recordServerWire(page: Page) {
  await page.addInitScript(() => {
    const log: string[] = [];
    (window as unknown as { __nqWire: string[] }).__nqWire = log;
    const original = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await original(input, init);
      try {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (!url.includes("/api/")) return res;
        const copy = res.clone();
        if ((res.headers.get("content-type") ?? "").includes("text/event-stream") && copy.body) {
          const reader = copy.body.pipeThrough(new TextDecoderStream()).getReader();
          void (async () => {
            for (;;) {
              const { value, done } = await reader.read();
              if (done) break;
              log.push(`${url} ${value}`);
            }
          })().catch(() => undefined);
        } else {
          void copy
            .text()
            .then((text) => log.push(`${url} ${text}`))
            .catch(() => undefined);
        }
      } catch {
        /* recording must never break the app */
      }
      return res;
    };
  });
  return {
    text: () => page.evaluate(() => (window as unknown as { __nqWire: string[] }).__nqWire.join("\n")),
  };
}

/**
 * Records every message on the local realtime BroadcastChannel as seen by this page
 * (offline demo / local transport).
 */
export async function recordWire(page: Page) {
  await page.addInitScript(() => {
    const log: string[] = [];
    (window as unknown as { __nqWire: string[] }).__nqWire = log;
    const channel = new BroadcastChannel("nq-local-v1");
    channel.addEventListener("message", (e: MessageEvent) => log.push(JSON.stringify(e.data)));
  });
  return {
    messages: () => page.evaluate(() => [...(window as unknown as { __nqWire: string[] }).__nqWire]),
  };
}

/* ------------------------------------------------------------------ */
/* Player flow                                                          */
/* ------------------------------------------------------------------ */

/** /join → PIN → profile. Resolves on the profile screen with the room looked up. */
export async function enterPin(page: Page, pin: string) {
  await page.goto("/join");
  const code = page.getByLabel(ID.join.codeLabel);
  await expect(code).toBeVisible();
  await code.fill(pin);
  // A full PIN checks itself.
  await page.waitForURL(new RegExp(`/join/profile\\?room=${pin}`), { timeout: NAV_TIMEOUT });
}

/** Fills the nickname and presses "Gabung" once the room lookup resolved. */
export async function submitNickname(page: Page, nickname: string) {
  const name = page.getByLabel(ID.join.nicknameLabel);
  await expect(name).toBeVisible();
  const join = page.getByRole("button", { name: ID.join.joinCta, exact: true });
  // On a cold `next dev` the server HTML is interactive-looking before React hydrates;
  // text typed then is reset by the controlled input. Retype until React has it.
  await expect(async () => {
    if ((await name.inputValue()) !== nickname) await name.fill(nickname);
    await expect(join).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: NAV_TIMEOUT });
  await join.click();
}

/** /join → PIN → nickname → lobby. */
export async function joinAsPlayer(page: Page, nickname: string, pin = DEMO_PIN) {
  await enterPin(page, pin);
  await submitNickname(page, nickname);
  await page.waitForURL(new RegExp(`/room/${pin}/lobby`), { timeout: NAV_TIMEOUT });
  await expect(page.getByRole("heading", { name: ID.lobby.ready })).toBeVisible({ timeout: NAV_TIMEOUT });
}

/**
 * Solo demo: the phone's virtual host starts ~5 s after joining, so on a cold `next dev`
 * the lobby may already be over when it renders. Joins and returns once the phone left
 * the profile screen (lobby or game).
 */
export async function joinSoloDemo(page: Page, nickname: string) {
  await enterPin(page, DEMO_PIN);
  await submitNickname(page, nickname);
  await page.waitForURL(new RegExp(`/room/${DEMO_PIN}/lobby|/play/demo`), { timeout: NAV_TIMEOUT });
}

/**
 * Answers whichever OS Battle question is on screen with a WRONG option and returns it.
 * Used where the game clock is not ours (solo demo), so the spec does not depend on
 * catching question 1.
 */
export async function answerCurrentQuestionWrong(page: Page) {
  const answers = page.locator("button[data-state]");
  await expect(answers.first()).toBeVisible({ timeout: 90_000 });
  const prompt = ((await page.getByRole("heading", { level: 1 }).first().textContent()) ?? "").trim();
  const question = OS_BATTLE.questions.find((q) => q.prompt === prompt);
  if (!question) throw new Error(`not an OS Battle question on screen: "${prompt}"`);
  await expect(answers).toHaveCount(question.answers.length);
  const wrong = question.answers.find((a) => !a.isCorrect)!;
  // The option text shares its element with a screen-reader "A. " prefix: match the button's name.
  await answerButton(page, wrong.text).click();
  return question;
}

/** The answer button whose visible text is `text`. */
export function answerButton(page: Page, text: string) {
  return page.getByRole("button", { name: new RegExp(escapeRegExp(text)) });
}

/** Parses "+1.050 PTS" / "+850 PTS" style labels into a number. */
export function parsePoints(label: string | null): number {
  const digits = (label ?? "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : Number.NaN;
}

/** Host lobby: number of players on the arena floor (list label "{n} pemain"). */
export async function lobbyCount(host: Page): Promise<number> {
  const list = host.getByRole("list", { name: new RegExp(`^\\d+ ${ID.common.players}$`) });
  const label = (await list.getAttribute("aria-label").catch(() => null)) ?? "";
  return Number(label.replace(/\D/g, "")) || 0;
}

/** Host lobby: the PIN on the projector, digits only. */
export async function projectorPin(host: Page): Promise<string> {
  const pin = host.locator(`[aria-label^="${ID.host.pinLabel}:"]`).first();
  await expect(pin).toBeVisible({ timeout: NAV_TIMEOUT });
  return ((await pin.getAttribute("aria-label")) ?? "").replace(/\D/g, "");
}
