/**
 * Lecturer → classroom, memory mode: the library starts a REAL server session for
 * OS Battle, the projector shows its fresh 6-digit PIN, a phone (separate context)
 * joins that PIN, plays question 1, and the lecturer skips through the rest of the
 * quiz until the podium. No bots: the phone is the whole class, so it must win.
 */

import { expect, test } from "@playwright/test";
import { OS_BATTLE } from "../../lib/seed/quizzes";
import {
  API_TIMEOUT,
  DEMO_PIN,
  NAV_TIMEOUT,
  EXPECTED_API_STATUS,
  ID,
  answerButton,
  joinAsPlayer,
  openPhone,
  parsePoints,
  projectorPin,
  requireServerMode,
  runTag,
  trackErrors,
} from "./helpers";

const firstQuestion = OS_BATTLE.questions[0]!;
const correctText = firstQuestion.answers.find((a) => a.isCorrect)!.text;

test("library → start session → phone joins the new PIN → answer → skip to the podium", async ({
  page: host,
  browser,
}) => {
  test.setTimeout(300_000);
  // Database mode keeps quizzes on the server behind a login; this spec covers the no-database setup.
  await requireServerMode(host.request, ["memory"]);
  const hostErrors = trackErrors(host, [EXPECTED_API_STATUS]);
  const nickname = `Dewi ${runTag()}`;

  /* ---- the lecturer starts OS Battle from the library ------------------- */
  await host.goto("/quizzes");
  const startButton = host.getByRole("button", { name: `${ID.creator.startSession}: ${OS_BATTLE.title}` });
  await expect(startButton).toBeVisible({ timeout: NAV_TIMEOUT });
  const created = host.waitForResponse((r) => r.url().endsWith("/api/sessions") && r.request().method() === "POST", {
    timeout: API_TIMEOUT,
  });
  await startButton.click();
  expect((await created).status(), "POST /api/sessions").toBeLessThan(300);

  await host.waitForURL(/\/host\/session\/[0-9a-f-]{36}\/lobby$/, { timeout: NAV_TIMEOUT });
  const sessionId = host.url().match(/\/host\/session\/([^/]+)\/lobby/)![1]!;
  // First SSE connect can wait on a route compile in `next dev`.
  await expect(host.getByText(OS_BATTLE.title).first()).toBeVisible({ timeout: 60_000 });
  const pin = await projectorPin(host);
  expect(pin).toMatch(/^[1-9]\d{5}$/);
  expect(pin).not.toBe(DEMO_PIN);

  /* ---- a phone joins that PIN ------------------------------------------- */
  const phone = await openPhone(browser);
  const player = phone.page;
  const playerErrors = trackErrors(player, [EXPECTED_API_STATUS]);
  await joinAsPlayer(player, nickname, pin);
  await expect(host.getByText(nickname).first()).toBeVisible({ timeout: NAV_TIMEOUT });

  /* ---- start → question 1 → a correct answer ----------------------------- */
  await host.getByRole("button", { name: ID.host.start }).click();
  await expect(player.getByRole("heading", { level: 1, name: firstQuestion.prompt })).toBeVisible({
    timeout: NAV_TIMEOUT,
  });
  await expect(player).toHaveURL(new RegExp(`/play/${sessionId}$`));
  await answerButton(player, correctText).click();

  // The only player answered: the server closes the question early, no reveal click needed.
  await expect(player.getByRole("heading", { name: ID.result.correct })).toBeVisible({ timeout: NAV_TIMEOUT });
  const points = parsePoints(await player.getByLabel(/^\+[\d.,]+ PTS$/).getAttribute("aria-label"));
  expect(points).toBeGreaterThanOrEqual(700);
  await expect(player.getByText("#1 / 1")).toBeVisible();

  /* ---- the lecturer moves on and skips every remaining question ---------- */
  const leaderboard = host.getByRole("button", { name: ID.host.showLeaderboard, exact: true });
  await leaderboard.click();
  await host.getByRole("button", { name: ID.host.next, exact: true }).click();

  const podium = host.getByRole("heading", { name: ID.host.gameOver });
  const skip = host.getByRole("button", { name: ID.host.skip });
  let skips = 0;
  while (skips < OS_BATTLE.questions.length + 2) {
    await expect(podium.or(skip)).toBeVisible({ timeout: 15_000 });
    if (await podium.isVisible()) break;
    await skip.click({ timeout: 5_000 }).catch(() => undefined);
    skips += 1;
    await host.waitForTimeout(250);
  }
  await expect(podium).toBeVisible({ timeout: 15_000 });
  await expect(host).toHaveURL(new RegExp(`/host/session/${sessionId}/podium$`));
  expect(skips, "questions 2..10 were skipped one by one").toBeGreaterThanOrEqual(OS_BATTLE.questions.length - 1);
  await expect(host.getByText(nickname).first()).toBeVisible({ timeout: 15_000 });

  /* ---- the phone shows the personal summary: #1 of 1 ---------------------- */
  const finalRank = player.getByRole("region", { name: ID.final.yourRank });
  await expect(finalRank).toBeVisible({ timeout: NAV_TIMEOUT });
  await expect(finalRank).toContainText(nickname);
  await expect(finalRank).toContainText("#01");
  expect(parsePoints(await finalRank.getByLabel(/PTS$/).first().getAttribute("aria-label"))).toBe(points);
  await expect(player).toHaveURL(new RegExp(`/play/${sessionId}/final$`));

  /* ---- the session shows up in the lecturer's history --------------------- */
  const sessions = await host.request.get("/api/sessions", { failOnStatusCode: false, timeout: API_TIMEOUT });
  expect(sessions.status()).toBe(200);
  expect(JSON.stringify(await sessions.json())).toContain(sessionId);

  await phone.context.close();
  expect(hostErrors, hostErrors.join("\n")).toEqual([]);
  expect(playerErrors, playerErrors.join("\n")).toEqual([]);
});
