/**
 * The classroom, for real: two devices on the SELF-HOSTED game server.
 *
 *   A  projector  desktop context at /host/session/demo/lobby (server demo, 41 bots)
 *   B  phone      separate Pixel 7 context, joins PIN 482913 over HTTP + SSE
 *
 * The contexts share nothing (no localStorage, no BroadcastChannel), so every state
 * change B sees travelled through the Next.js server. Serial on purpose: the first
 * test ends the shared server demo, which is exactly the condition the second test
 * needs (the demo PIN then falls back to the offline solo demo on the phone).
 */

import { expect, test, type Page, type Request } from "@playwright/test";
import { OS_BATTLE } from "../../lib/seed/quizzes";
import {
  API_TIMEOUT,
  NAV_TIMEOUT,
  DEMO_PIN,
  DEMO_SESSION,
  EXPECTED_API_STATUS,
  ID,
  answerButton,
  answerCurrentQuestionWrong,
  endServerDemo,
  enterPin,
  joinAsPlayer,
  joinSoloDemo,
  lobbyCount,
  openPhone,
  parsePoints,
  recordServerWire,
  requireServerMode,
  runTag,
  sameOrigin,
  signInIfNeeded,
  submitNickname,
  trackErrors,
} from "./helpers";

const firstQuestion = OS_BATTLE.questions[0]!;
const correctText = firstQuestion.answers.find((a) => a.isCorrect)!.text;

/** Bots join every ~0.7 s; a handful proves the projector's SSE fan-out without waiting for all 41. */
const MIN_BOTS = 6;

test.describe.serial("server demo: projector + phone", () => {
  test.describe.configure({ timeout: 300_000 });

  test("a phone joins the projector's server demo, answers, scores, ranks and sees the end", async ({
    page: host,
    browser,
  }) => {
    const { mode } = await requireServerMode(host.request);
    await signInIfNeeded(host, mode);

    // A fresh demo every run: end whatever an earlier (possibly aborted) run left behind.
    await endServerDemo(host.request);

    const hostErrors = trackErrors(host, [EXPECTED_API_STATUS]);
    const nickname = `Rara ${runTag()}`;

    /* ---- A: the projector opens the server demo lobby ----------------- */
    const demoHost = host.waitForResponse(
      (r) => r.url().endsWith("/api/demo/host") && r.request().method() === "POST",
      { timeout: API_TIMEOUT },
    );
    await host.goto("/host/session/demo/lobby");
    expect((await demoHost).status(), "POST /api/demo/host").toBe(200);
    const start = host.getByRole("button", { name: ID.host.start });
    await expect(start).toBeVisible({ timeout: 60_000 });
    await expect(host.locator(`[aria-label^="${ID.host.pinLabel}:"]`).first()).toHaveAttribute(
      "aria-label",
      /4 8 2\s+9 1 3/,
    );

    // A projector opened on localhost advertises an address phones can actually reach.
    const network = await host.request.get("/api/network", { timeout: API_TIMEOUT });
    const { origins } = (await network.json()) as { origins: string[] };
    const qr = host.locator(`[aria-label^="${ID.host.orScan}: "]`).first();
    await expect(qr).toHaveAttribute("aria-label", new RegExp(`/join\\?room=${DEMO_PIN}$`));
    if (origins.length > 0) await expect(qr).not.toHaveAttribute("aria-label", /\/\/(localhost|127\.0\.0\.1)[:/]/);

    // Bots trickle in: the projector's player list grows through its own SSE stream.
    await expect
      .poll(() => lobbyCount(host), { timeout: 30_000, message: "bots arriving on the projector" })
      .toBeGreaterThanOrEqual(MIN_BOTS);

    /* ---- B: a phone on the classroom Wi-Fi ----------------------------- */
    const phone = await openPhone(browser);
    const player = phone.page;
    const playerErrors = trackErrors(player, [EXPECTED_API_STATUS]);
    const wire = await recordServerWire(player);
    const playerRequests: Request[] = [];
    player.on("request", (r) => playerRequests.push(r));

    await joinAsPlayer(player, nickname, DEMO_PIN);
    // The phone really joined the SERVER session (not a local stand-in).
    expect(playerRequests.some((r) => r.method() === "POST" && r.url().endsWith(`/api/rooms/${DEMO_PIN}/join`))).toBe(
      true,
    );
    await expect(player.getByText(ID.lobby.waitingHost)).toBeVisible();

    // The projector lists the student among the bots.
    await expect(host.getByText(nickname).first()).toBeVisible({ timeout: NAV_TIMEOUT });

    /* ---- C: a second phone cannot take the same nickname --------------- */
    const twin = await openPhone(browser);
    const twinErrors = trackErrors(twin.page, [/status of 409/, EXPECTED_API_STATUS]);
    await enterPin(twin.page, DEMO_PIN);
    await submitNickname(twin.page, nickname);
    await expect(twin.page.getByRole("alert").filter({ hasText: ID.errors.nicknameTaken })).toBeVisible({
      timeout: 15_000,
    });
    await expect(twin.page).toHaveURL(/\/join\/profile/);
    expect(twinErrors, twinErrors.join("\n")).toEqual([]);
    await twin.context.close();

    /* ---- A starts; the intro auto-advances into question 1 -------------- */
    await expect(start).toBeEnabled();
    await start.click();

    const prompt = player.getByRole("heading", { level: 1, name: firstQuestion.prompt });
    await expect(prompt).toBeVisible({ timeout: NAV_TIMEOUT });
    await expect(player).toHaveURL(new RegExp(`/play/${DEMO_SESSION}$`));

    /* ---- B answers correctly ------------------------------------------- */
    const answerPosts = () =>
      playerRequests.filter((r) => r.method() === "POST" && /\/api\/sessions\/[^/]+\/answer$/.test(r.url()));
    const answered = player.waitForResponse(
      (r) => r.request().method() === "POST" && /\/api\/sessions\/[^/]+\/answer$/.test(r.url()),
      {
        timeout: API_TIMEOUT,
      },
    );
    await answerButton(player, correctText).click();
    await expect(player.getByText(ID.play.locked).first()).toBeVisible({ timeout: 15_000 });
    await expect(player).toHaveURL(new RegExp(`/play/${DEMO_SESSION}/waiting$`));
    // The server has recorded it (only then is a replay meaningful).
    expect(((await (await answered).json()) as { status: string }).status).toBe("accepted");
    await expect.poll(() => answerPosts().length).toBe(1);
    const submitted = answerPosts()[0]!.postDataJSON() as {
      playerId: string;
      token: string;
      questionId: string;
      payload: unknown;
    };

    // The token only ever travels in POST bodies: never in a URL a proxy could log.
    expect(submitted.token.length).toBeGreaterThan(10);
    for (const r of playerRequests) expect(r.url(), "token in URL").not.toContain(submitted.token);

    // Nothing that reached the phone while the question was open carried the answer key.
    const beforeReveal = await wire.text();
    expect(beforeReveal).toContain('"phase":"question"');
    for (const secret of ["isCorrect", "correctAnswerIds", "correctText", "acceptedAnswers", "explanation"]) {
      expect(beforeReveal, `"${secret}" reached the phone before the reveal`).not.toContain(secret);
    }

    // A hand-crafted replay with the phone's own credentials is refused by the server.
    const replay = await player.request.post(`/api/sessions/${DEMO_SESSION}/answer`, {
      headers: sameOrigin(),
      data: {
        ...submitted,
        payload: { kind: "choice", answerIds: [firstQuestion.answers.find((a) => !a.isCorrect)!.id] },
      },
      failOnStatusCode: false,
      timeout: API_TIMEOUT,
    });
    const replayBody = (await replay.json().catch(() => null)) as { status?: string } | null;
    expect(replayBody?.status, `replayed answer → HTTP ${replay.status()} ${JSON.stringify(replayBody)}`).toBe(
      "duplicate",
    );

    /* ---- refresh mid-question: still locked, never a second submit ------ */
    // The projector pauses first, so the 20 s question cannot close under a slow reload.
    await host.getByRole("button", { name: ID.host.pause, exact: true }).click();
    await expect(host.getByRole("button", { name: ID.host.resume, exact: true })).toBeVisible();
    await player.reload();
    await expect(player.getByText(ID.play.locked).first()).toBeVisible({ timeout: NAV_TIMEOUT });
    await expect(player.locator("button[data-state]")).toHaveCount(0);
    expect(answerPosts(), "a refresh must not resubmit").toHaveLength(1);
    await host.getByRole("button", { name: ID.host.resume, exact: true }).click();
    await expect(host.getByRole("button", { name: ID.host.pause, exact: true })).toBeVisible();

    /* ---- A reveals (unless every connected player already answered) ----- */
    const reveal = host.getByRole("button", { name: ID.host.showResults });
    if (await reveal.isVisible()) await reveal.click({ timeout: 5_000 }).catch(() => undefined);

    await expect(player.getByRole("heading", { name: ID.result.correct })).toBeVisible({ timeout: 40_000 });
    await expect(player).toHaveURL(new RegExp(`/play/${DEMO_SESSION}/result$`));
    const gained = player.getByLabel(/^\+[\d.,]+ PTS$/);
    await expect(gained).toBeVisible();
    const points = parsePoints(await gained.getAttribute("aria-label"));
    expect(points).toBeGreaterThanOrEqual(700); // a correct answer always earns at least 70 %
    expect(points).toBeLessThanOrEqual(1000);
    await expect(player.getByText(ID.result.rank)).toBeVisible();
    await expect(player.getByText(/^#\d+ \/ \d+$/)).toBeVisible();

    /* ---- A shows the leaderboard; B keeps its rank ---------------------- */
    await host.getByRole("button", { name: ID.host.showLeaderboard, exact: true }).click();
    await expect(host.getByRole("list", { name: ID.host.leaderboard })).toBeVisible({ timeout: 15_000 });
    await expect(host.getByRole("button", { name: ID.host.next })).toBeVisible();
    const rankLine = player.getByText(/^#\d+ \/ \d+$/);
    await expect(rankLine).toBeVisible();
    const [rank, total] = ((await rankLine.textContent()) ?? "").match(/\d+/g)!.map(Number) as [number, number];
    expect(rank).toBeGreaterThanOrEqual(1);
    expect(rank).toBeLessThanOrEqual(total);
    expect(total).toBeGreaterThan(MIN_BOTS); // the bots count as classmates

    /* ---- A ends the game early (with confirmation) ---------------------- */
    await host.getByRole("button", { name: ID.host.end, exact: true }).click();
    const dialog = host.getByRole("dialog", { name: ID.host.endConfirmTitle });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: ID.host.endConfirmCta }).click();
    await expect(dialog).toBeHidden();
    await expect(host.getByRole("heading", { name: ID.host.gameOver })).toBeVisible({ timeout: 15_000 });

    /* ---- B lands on the final / ended state ----------------------------- */
    const finalRank = player.getByRole("region", { name: ID.final.yourRank });
    const hostEnded = player.getByRole("heading", { name: ID.errors.hostEnded });
    await expect(finalRank.or(hostEnded)).toBeVisible({ timeout: NAV_TIMEOUT });
    if (await finalRank.isVisible()) {
      test.info().annotations.push({ type: "end-state", description: "final summary" });
      await expect(finalRank).toContainText(nickname);
      const totalScore = parsePoints(await finalRank.getByLabel(/PTS$/).first().getAttribute("aria-label"));
      expect(totalScore).toBe(points);
      await expect(player).toHaveURL(new RegExp(`/play/${DEMO_SESSION}/final$`));
    } else {
      test.info().annotations.push({ type: "end-state", description: "host-ended notice" });
    }

    await phone.context.close();
    expect(hostErrors, hostErrors.join("\n")).toEqual([]);
    expect(playerErrors, playerErrors.join("\n")).toEqual([]);
  });

  test("with no server demo running, the demo PIN falls back to the offline solo demo", async ({ page, browser }) => {
    // Timer-driven (virtual host + simulated class): ~50 s per question on a warm server.
    test.slow();
    const { mode } = await requireServerMode(page.request);
    await signInIfNeeded(page, mode);

    // The previous test ended the server demo; make sure (it may have failed half-way).
    const { lookup } = await endServerDemo(page.request);
    expect(lookup.status, "GET /api/rooms/482913 once the server demo has ended").toBe("not_found");

    const phone = await openPhone(browser);
    const player: Page = phone.page;
    const errors = trackErrors(player, [EXPECTED_API_STATUS]);
    const streams: string[] = [];
    player.on("request", (r) => {
      if (r.url().includes(`/api/sessions/${DEMO_SESSION}/events`)) streams.push(r.url());
    });

    await joinSoloDemo(player, `Bima ${runTag()}`);

    // No lecturer anywhere: the phone's virtual host starts the game on its own
    // (on a cold dev server it may already be past question 1 when the page renders).
    // Answer wrong on purpose: the result stays honest and friendly.
    await answerCurrentQuestionWrong(player);
    await expect(player.getByText(ID.play.locked).first()).toBeVisible();
    await expect(player.getByRole("heading", { name: ID.result.incorrect })).toBeVisible({ timeout: 60_000 });
    await expect(player.getByText(ID.result.correctAnswerWas)).toBeVisible();

    // It really was the local solo demo: the phone never opened a server event stream.
    expect(streams, "solo demo must not stream from the server").toEqual([]);

    await phone.context.close();
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
